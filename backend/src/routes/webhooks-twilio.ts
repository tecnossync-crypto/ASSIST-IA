import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { colaEsperaConfig, hayAsesoresDisponibles, marcarEnCola } from "../lib/cola-espera.js";
import { llamadaYaSeGraba } from "../lib/estado-grabacion.js";
import {
  twimlConnectVoiceAgent,
  twimlColgar,
  twimlEsperarConferencia,
  twimlUnirseConferenciaComoAgente,
  twimlTransferirCentralPropia,
} from "../lib/twiml.js";
import { clienteTwilioEmpresa } from "../lib/twilio-empresa.js";
import { procesarGrabacion } from "../jobs/procesar-grabacion.js";
import { reprogramarOFallar } from "../jobs/dispatcher-campanas.js";
import { asegurarContacto } from "../lib/contactos.js";
import { ejecutarFlujosTrabajo } from "../lib/flujos-trabajo.js";
import { usuarioIdDesdeIdentidad } from "../lib/agentes.js";
import { iniciarConferenciaConAgentes } from "../lib/conferencia-agentes.js";
import { descartarFallbackCentral, reintentarDirectoSiCorresponde } from "../lib/fallback-central.js";
import { destinoDeTransferencia, extensionesDeTransferencia } from "../lib/enrutamiento.js";

/**
 * Webhooks de Twilio para la cuenta del cliente.
 * Fase 0: solo entrantes → graba + conecta al servidor de voz IA.
 * TODO Fase 1: resolver empresa por número destino (multi-tenant real),
 * no un solo ENV fijo.
 */
const MENSAJE_COLA =
  "Todos nuestros asesores están atendiendo otras llamadas. Por favor permanezca en línea, en breve lo atenderemos.";

export async function webhooksTwilioRoutes(app: FastifyInstance) {
  app.post("/webhooks/twilio/voice-inbound", async (req, reply) => {
    const body = req.body as Record<string, string>;
    const callSid = body.CallSid;
    const from = body.From;
    const to = body.To;

    app.log.info({ callSid, from, to }, "Llamada entrante recibida");

    // TODO: resolver empresa_id real a partir de `to` (número Twilio del cliente).
    const empresa = await pool.query<{ id: string; voz_agente: string | null; tts_provider: string | null }>(
      "SELECT id, voz_agente, tts_provider FROM empresas WHERE twilio_phone_number = $1 LIMIT 1",
      [to]
    );

    if (empresa.rows.length === 0) {
      app.log.warn({ to }, "No hay empresa configurada para este número");
      reply.type("text/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-MX">Este número no está configurado todavía.</Say></Response>`
      );
      return;
    }

    const { id: empresaId, voz_agente: voz, tts_provider: ttsProvider } = empresa.rows[0];

    await pool.query(
      `INSERT INTO llamadas (empresa_id, call_sid, direccion, numero_origen, numero_destino, estado)
       VALUES ($1, $2, 'entrante', $3, $4, 'en_curso')
       ON CONFLICT (call_sid) DO NOTHING`,
      [empresaId, callSid, from, to]
    );
    await asegurarContacto(empresaId, from);

    const voiceWsUrl = process.env.VOICE_WS_URL;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    if (!voiceWsUrl) throw new Error("VOICE_WS_URL no está configurado");
    if (!publicBaseUrl) throw new Error("PUBLIC_BASE_URL no está configurado");

    const twiml = twimlConnectVoiceAgent({
      voiceWsUrl,
      empresaId,
      callSid,
      numeroCliente: from,
      voz,
      ttsProvider,
      publicBaseUrl,
    });
    reply.type("text/xml").send(twiml);
  });

  // Twilio llega acá cuando contestan una llamada saliente que nosotros
  // originamos (ver POST /api/llamadas/salientes). empresaId viaja en la
  // query string porque nosotros armamos esta URL al crear la llamada.
  app.post<{
    Querystring: {
      empresaId?: string;
      campanaContactoId?: string;
      webhookLlamadaId?: string;
      viaCentral?: string;
      numero?: string;
    };
  }>(
    "/webhooks/twilio/voice-outbound",
    async (req, reply) => {
      const body = req.body as Record<string, string>;
      const callSid = body.CallSid;
      const from = body.From;
      const { empresaId, campanaContactoId, webhookLlamadaId, viaCentral, numero } = req.query;
      // Si salió por la central propia, "To" es la dirección SIP y contesta el
      // DISA — el teléfono real del cliente viaja en la query (ver urlExtra en
      // lib/twilio-empresa.ts).
      const to = numero || body.To;
      const salioPorCentral = viaCentral === "1";

      app.log.info({ callSid, from, to, empresaId, campanaContactoId, webhookLlamadaId }, "Llamada saliente contestada");

      if (!empresaId) {
        reply.type("text/xml").send(twimlColgar());
        return;
      }

      await pool.query(
        `INSERT INTO llamadas (empresa_id, call_sid, direccion, numero_origen, numero_destino, estado, campana_contacto_id)
         VALUES ($1, $2, 'saliente', $3, $4, 'en_curso', $5)
         ON CONFLICT (call_sid) DO NOTHING`,
        [empresaId, callSid, from, to, campanaContactoId ?? null]
      );
      await asegurarContacto(empresaId, to);

      if (campanaContactoId) {
        await pool.query(
          `UPDATE campana_contactos SET ultima_llamada_id = (SELECT id FROM llamadas WHERE call_sid = $2) WHERE id = $1`,
          [campanaContactoId, callSid]
        );
      }

      if (webhookLlamadaId) {
        await pool.query(`UPDATE llamadas_webhook SET call_sid = $2 WHERE id = $1`, [webhookLlamadaId, callSid]);
      }

      const voiceWsUrl = process.env.VOICE_WS_URL;
      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!voiceWsUrl) throw new Error("VOICE_WS_URL no está configurado");
      if (!publicBaseUrl) throw new Error("PUBLIC_BASE_URL no está configurado");

      const voz = await pool.query<{ voz_agente: string | null; tts_provider: string | null }>(
        "SELECT voz_agente, tts_provider FROM empresas WHERE id = $1",
        [empresaId]
      );

      reply.type("text/xml").send(
        twimlConnectVoiceAgent({
          voiceWsUrl,
          empresaId,
          callSid,
          numeroCliente: to,
          webhookLlamadaId,
          voz: voz.rows[0]?.voz_agente ?? null,
          ttsProvider: voz.rows[0]?.tts_provider ?? null,
          campanaContactoId,
          esperarVozCliente: salioPorCentral,
          publicBaseUrl,
        })
      );
    }
  );

  // "Llamada normal": el cliente contesta y se conecta directo con un
  // humano SIN salir de la plataforma — se marca al/los softphone(s) de
  // los agentes disponibles (dashboard web o ejecutable de escritorio),
  // según el enrutamiento configurado por la empresa (todos | round_robin |
  // disponibilidad). empresaId viaja en la query string porque nosotros
  // armamos esta URL al crear la llamada.
  app.post<{
    Querystring: { empresaId?: string; colaId?: string; origenExterno?: string; usuarioId?: string; numero?: string };
  }>(
    "/webhooks/twilio/voice-normal",
    async (req, reply) => {
      const { empresaId, colaId, origenExterno, usuarioId, numero } = req.query;
      const body = req.body as Record<string, string>;
      // Si salió por la central propia, "To" es la dirección SIP — el
      // teléfono real del cliente viaja en la query (ver urlExtra en
      // lib/twilio-empresa.ts).
      const numeroCliente = numero || body.To;
      const publicBaseUrl = process.env.PUBLIC_BASE_URL;

      if (!empresaId || !publicBaseUrl) {
        reply.type("text/xml").send(twimlColgar());
        return;
      }

      // Deja rastro en `llamadas` igual que cualquier otra (con IA o
      // saliente), así el panel de teléfono la puede monitorear y aparece en
      // el historial (con la cola que la atendió, si aplica). La conferencia
      // se nombra con el id de la llamada — el cliente entra a esperar ahí
      // (ver twimlEsperarConferencia); esto es lo que permite que un admin se
      // pueda unir después a escuchar/intervenir sin tocar la pierna original.
      // origenExterno viaja acá cuando la disparó un webhook de una
      // plataforma de terceros (click-to-call), no el dashboard — así el
      // widget de "llamadas externas" la puede distinguir.
      const llamada = await pool.query<{ id: string }>(
        `INSERT INTO llamadas (empresa_id, call_sid, direccion, numero_origen, numero_destino, estado, cola_id, origen_externo)
         VALUES ($1, $2, 'saliente', $3, $4, 'en_curso', $5, $6)
         ON CONFLICT (call_sid) DO UPDATE SET call_sid = EXCLUDED.call_sid
         RETURNING id`,
        [empresaId, body.CallSid, body.From, numeroCliente, colaId ?? null, origenExterno ?? null]
      );
      const llamadaId = llamada.rows[0].id;
      const conferenciaNombre = `llamada-${llamadaId}`;
      await asegurarContacto(empresaId, numeroCliente);

      const { identidades } = await iniciarConferenciaConAgentes({
        empresaId,
        llamadaId,
        conferenciaNombre,
        colaId,
        publicBaseUrl,
        usuarioIdDirecto: usuarioId,
      });
      if (identidades.length === 0) {
        app.log.warn({ empresaId, colaId }, "Llamada normal sin agentes disponibles");
        reply
          .type("text/xml")
          .send(twimlColgar("En este momento no hay agentes disponibles. Por favor intente más tarde."));
        return;
      }

      reply.type("text/xml").send(twimlEsperarConferencia({ conferenciaNombre, publicBaseUrl }));
    }
  );

  // TwiML que contesta cada pierna de agente marcada arriba: la mete a la
  // misma conferencia donde espera el cliente.
  app.post<{ Querystring: { conferencia?: string } }>(
    "/webhooks/twilio/conferencia-agente",
    async (req, reply) => {
      const { conferencia } = req.query;
      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!conferencia || !publicBaseUrl) {
        reply.type("text/xml").send(twimlColgar());
        return;
      }
      reply.type("text/xml").send(twimlUnirseConferenciaComoAgente({ conferenciaNombre: conferencia, publicBaseUrl }));
    }
  );

  // Cuando el primer agente entra a la conferencia, cancela las piernas de
  // los demás agentes que todavía estén timbrando (mismo comportamiento que
  // "el primero que conteste se la queda" del <Dial> con varios <Client>).
  app.post("/webhooks/twilio/conferencia-evento", async (req, reply) => {
    reply.send({ ok: true }); // responder ya, el resto corre aparte

    const body = req.body as Record<string, string>;
    const evento = body.StatusCallbackEvent;
    const friendlyName = body.FriendlyName; // "llamada-<id>"
    const callSid = body.CallSid;
    if (evento !== "participant-join" || !friendlyName?.startsWith("llamada-") || !callSid) return;

    const llamadaId = friendlyName.slice("llamada-".length);
    const llamada = await pool.query<{
      empresa_id: string;
      agentes_call_sids: string[];
      agente_call_sid: string | null;
      agentes_call_sids_identidad: Record<string, string>;
    }>(
      "SELECT empresa_id, agentes_call_sids, agente_call_sid, agentes_call_sids_identidad FROM llamadas WHERE id = $1",
      [llamadaId]
    );
    const row = llamada.rows[0];
    if (!row || !row.agentes_call_sids.includes(callSid)) return; // es el cliente entrando, no un agente

    if (row.agente_call_sid) return; // ya había un agente conectado, nada que hacer

    // Resuelve qué agente contestó (para el panel de supervisión en vivo) a
    // partir de la identidad con la que se marcó esa pierna.
    const identidad = row.agentes_call_sids_identidad[callSid];
    const agenteUsuarioId = identidad ? usuarioIdDesdeIdentidad(identidad) : null;

    await pool.query(
      "UPDATE llamadas SET agente_call_sid = $2, agente_usuario_id = $3, estado = 'en_curso', en_cola_desde = NULL WHERE id = $1",
      [llamadaId, callSid, agenteUsuarioId]
    );

    const twilioEmpresa = await clienteTwilioEmpresa(row.empresa_id);
    if (!twilioEmpresa) return;

    const otrasPiernas = row.agentes_call_sids.filter((sid) => sid !== callSid);
    await Promise.all(
      otrasPiernas.map((sid) =>
        twilioEmpresa.client
          .calls(sid)
          .update({ status: "completed" })
          .catch(() => {}) // ya contestada, ya colgada, etc. — no importa
      )
    );
  });

  // Se ejecuta cuando ConversationRelay termina (el bot mandó "end" o la
  // llamada se cayó) y TwiML cae al <Redirect> puesto después de <Connect>.
  // Si el bot marcó transferencia, la llamada entra a la MISMA conferencia
  // y se marcan agentes por el mismo enrutamiento (colas/round_robin/etc.)
  // que "llamada normal" — todo se maneja dentro de la plataforma, no hay
  // número externo de respaldo (si algún día se conecta una central
  // telefónica, es otro tema aparte).
  app.post("/webhooks/twilio/post-relay", async (req, reply) => {
    const body = req.body as Record<string, string>;
    const callSid = body.CallSid;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;

    const llamada = await pool.query<{
      id: string;
      empresa_id: string;
      cola_id: string | null;
      transferida: boolean;
    }>("SELECT id, empresa_id, cola_id, transferida FROM llamadas WHERE call_sid = $1", [callSid]);
    const row = llamada.rows[0];

    if (!row?.transferida || !publicBaseUrl) {
      reply.type("text/xml").send(twimlColgar());
      return;
    }

    // Dónde se atiende (plataforma / central / ambos) lo decide la cola o,
    // si no tiene, la empresa — ver Configuración → Enrutamiento.
    const destino = await destinoDeTransferencia(row.empresa_id, row.cola_id);

    // La IA arranca una grabación al contestar y sigue activa tras transferir:
    // si ya hay una corriendo no se arranca otra (quedaría repetida); si por
    // algo no la hay, se arranca aquí para que ninguna llamada quede sin grabar.
    const yaGrabando = await llamadaYaSeGraba(await clienteTwilioEmpresa(row.empresa_id), callSid);

    if (destino !== "central") {
      const conferenciaNombre = `llamada-${row.id}`;
      const cola = await colaEsperaConfig(row.empresa_id);
      const hayAsesores = await hayAsesoresDisponibles(row.empresa_id, row.cola_id);

      // Sin asesores activos y con la cola de espera encendida: el cliente
      // espera en línea (con música) en vez de que se le cuelgue, y los
      // asesores lo ven en la pestaña "Cola" del panel de teléfono.
      if (!hayAsesores && cola.activa && destino === "plataforma") {
        await marcarEnCola(row.id, conferenciaNombre);
        app.log.info({ callSid, colaId: row.cola_id }, "Sin asesores disponibles: el cliente espera en la cola");
        reply.type("text/xml").send(
          twimlEsperarConferencia({ conferenciaNombre, publicBaseUrl, grabar: !yaGrabando, mensajeEspera: MENSAJE_COLA })
        );
        return;
      }

      // Con destino "ambos" y nadie activo en la plataforma se pasa directo a
      // la central. (Antes se timbraba igual a la identidad genérica del
      // softphone y el respaldo de la central casi nunca llegaba a usarse.)
      if (hayAsesores || destino === "plataforma") {
        const { identidades } = await iniciarConferenciaConAgentes({
          empresaId: row.empresa_id,
          llamadaId: row.id,
          conferenciaNombre,
          colaId: row.cola_id,
          publicBaseUrl,
        });

        if (identidades.length > 0) {
          app.log.info({ callSid, identidades }, "Transfiriendo llamada del bot a agente(s) disponible(s)");
          // Mientras nadie conteste, el cliente cuenta como "en cola" (la
          // conferencia-evento lo saca de ahí cuando un asesor entra).
          if (cola.activa) await marcarEnCola(row.id, conferenciaNombre);
          reply.type("text/xml").send(twimlEsperarConferencia({ conferenciaNombre, publicBaseUrl, grabar: !yaGrabando }));
          return;
        }
      }
    }

    // A las extensiones de la central: directo si el destino es "central", o
    // como respaldo si es "ambos" y no había agentes de la plataforma. Solo si
    // la empresa tiene la central activa para entrantes. Ver
    // twimlTransferirCentralPropia() para el aviso sobre pruebas en vivo.
    if (destino !== "plataforma") {
      const twilioEmpresa = await clienteTwilioEmpresa(row.empresa_id);
      if (!twilioEmpresa?.centralPropia?.entrante) {
        app.log.warn(
          {
            callSid,
            destino,
            twilioConfigurado: !!twilioEmpresa,
            centralActivaConDominio: !!twilioEmpresa?.centralPropia,
            entrante: twilioEmpresa?.centralPropia?.entrante ?? null,
          },
          "Destino con central, pero la central propia no está activa/con dominio o 'entrantes' está apagado"
        );
      } else {
        const extensiones = await extensionesDeTransferencia(row.empresa_id, row.cola_id);
        if (extensiones.length === 0) {
          app.log.warn(
            { callSid, destino, colaId: row.cola_id },
            "Destino con central, pero no hay extensiones activas (ni del departamento ni generales)"
          );
        }
        if (extensiones.length > 0) {
          const central = twilioEmpresa.centralPropia;
          app.log.info(
            { callSid, colaId: row.cola_id, destino, extensiones },
            "Transfiriendo llamada de la IA a extensiones de la central propia"
          );
          // Con autenticación por IP, "usuario/password" no son credenciales
          // SIP (la contraseña guardada ahí es el PIN del DISA) — no se mandan.
          const conCredenciales = central.authTipo === "credenciales";
          reply.type("text/xml").send(
            twimlTransferirCentralPropia({
              extensiones,
              dominio: central.dominio,
              usuario: conCredenciales ? central.usuario : null,
              password: conCredenciales ? central.password : null,
              publicBaseUrl,
              callSid,
              grabar: !yaGrabando,
            })
          );
          return;
        }
      }
    }

    app.log.warn({ callSid, destino }, "Transferencia sin agentes disponibles");
    reply
      .type("text/xml")
      .send(twimlColgar("En este momento no hay agentes disponibles. Por favor intente más tarde."));
  });

  // action de <Dial><Sip> en twimlTransferirCentralPropia() — Twilio pide
  // esto si la llamada a la extensión de la central no se pudo completar
  // (ocupado, no contestó, error de la PBX). DialCallStatus distingue "el
  // otro lado sí contestó y ya colgaron" (completed) de "nunca contestó".
  app.post<{ Querystring: { callSid?: string } }>(
    "/webhooks/twilio/central-propia-fallback",
    async (req, reply) => {
      const body = req.body as Record<string, string>;
      const dialCallStatus = body.DialCallStatus;

      app.log.info(
        {
          callSid: req.query.callSid,
          dialCallStatus,
          dialCallDuration: body.DialCallDuration,
          dialSipResponseCode: body.DialSipResponseCode,
        },
        "Resultado de la transferencia a extensiones de la central"
      );

      if (dialCallStatus === "completed") {
        // Ya se habló con alguien en la central y esa pierna colgó — cortar
        // sin decir nada más, igual que cuando cuelga un agente de la
        // plataforma.
        reply.type("text/xml").send(twimlColgar());
        return;
      }

      app.log.warn(
        { callSid: req.query.callSid, dialCallStatus },
        "Extensión de la central propia no contestó/falló"
      );
      reply
        .type("text/xml")
        .send(twimlColgar("En este momento no hay agentes disponibles. Por favor intente más tarde."));
    }
  );

  app.post<{ Querystring: { campanaContactoId?: string } }>(
    "/webhooks/twilio/call-status",
    async (req, reply) => {
      const body = req.body as Record<string, string>;
      const { CallSid: callSid, CallStatus: status, CallDuration: duration } = body;
      const { campanaContactoId } = req.query;

      app.log.info({ callSid, status, duration, campanaContactoId }, "Actualización de estado de llamada");

      // Llamada que salió por la central propia y la central no respondió:
      // se reintenta directo por Twilio y NO se procesa como fallida (ni se
      // reprograma la campaña ni se disparan flujos de "no contesta") — el
      // reintento tiene su propio ciclo de estado. Cualquier otro resultado
      // descarta el respaldo pendiente.
      if (status === "failed") {
        const reintentada = await reintentarDirectoSiCorresponde(callSid).catch((err) => {
          app.log.error({ err, callSid }, "Error reintentando la llamada directo por Twilio");
          return false;
        });
        if (reintentada) {
          reply.send({ ok: true });
          return;
        }
      } else {
        descartarFallbackCentral(callSid);
      }

      // Una llamada que terminó ya no espera en la cola (el cliente colgó, etc.).
      if (["completed", "busy", "no-answer", "failed", "canceled"].includes(status)) {
        await pool
          .query("UPDATE llamadas SET en_cola_desde = NULL WHERE call_sid = $1 AND en_cola_desde IS NOT NULL", [callSid])
          .catch(() => {});
      }

      if (status === "completed") {
        await pool.query(
          `UPDATE llamadas
           SET estado = 'completada', duracion_segundos = $2, finalizada_en = now()
           WHERE call_sid = $1`,
          [callSid, duration ? parseInt(duration, 10) : null]
        );
      }

      // Flujos de trabajo: reglas "cuando termina así, hacer esto" (etiquetar,
      // crear solicitud de seguimiento). Se evalúan para cualquier llamada,
      // no solo las de campaña.
      if (["completed", "busy", "no-answer", "failed", "canceled"].includes(status)) {
        const llamada = await pool.query<{
          id: string;
          empresa_id: string;
          direccion: "entrante" | "saliente";
          numero_origen: string;
          numero_destino: string;
          transferida: boolean;
        }>(
          "SELECT id, empresa_id, direccion, numero_origen, numero_destino, transferida FROM llamadas WHERE call_sid = $1",
          [callSid]
        );
        const l = llamada.rows[0];
        if (l) {
          const disparador =
            status === "completed" ? (l.transferida ? "llamada_transferida" : "llamada_completada") : "llamada_no_contesta";
          const numeroCliente = l.direccion === "entrante" ? l.numero_origen : l.numero_destino;
          await ejecutarFlujosTrabajo({ empresaId: l.empresa_id, disparador, numeroCliente, llamadaId: l.id }).catch(
            (err) => app.log.error({ err, callSid }, "Error ejecutando flujos de trabajo")
          );
        }
      }

      // Si esta llamada es de una campaña, actualiza el contacto: completada
      // si contestó, o reprograma/marca fallida según reintentos restantes.
      if (campanaContactoId) {
        if (status === "completed") {
          await pool.query(`UPDATE campana_contactos SET estado = 'completada' WHERE id = $1`, [
            campanaContactoId,
          ]);
        } else if (["busy", "no-answer", "failed", "canceled"].includes(status)) {
          const contacto = await pool.query<{ campana_id: string }>(
            "SELECT campana_id FROM campana_contactos WHERE id = $1",
            [campanaContactoId]
          );
          if (contacto.rows[0]) {
            await reprogramarOFallar(campanaContactoId, contacto.rows[0].campana_id);
          }
        }
      }

      reply.send({ ok: true });
    }
  );

  app.post("/webhooks/twilio/recording-status", async (req, reply) => {
    const body = req.body as Record<string, string>;
    const { CallSid: callSid, RecordingSid: recordingSid, RecordingStatus: status, RecordingDuration: duration } = body;

    app.log.info(body, "Callback de grabación de Twilio");

    // Respondemos ya para no hacer esperar a Twilio; el job corre aparte.
    reply.send({ ok: true });

    if (status !== "completed" || !recordingSid || !callSid) return;

    procesarGrabacion({
      callSid,
      recordingSid,
      recordingDurationSegundos: duration ? parseInt(duration, 10) : null,
    }).catch((err) => {
      app.log.error({ err, callSid, recordingSid }, "Error procesando grabación");
    });
  });
}
