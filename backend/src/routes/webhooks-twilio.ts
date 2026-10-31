import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { asignarColaAAsesoresLibres, colaEsperaConfig, hayAsesoresDisponibles, marcarEnCola } from "../lib/cola-espera.js";
import { programarRespaldoCentral, twimlParaCentral } from "../lib/respaldo-central.js";
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
import { despacharColaIA, marcarTerminadaEnCola } from "../lib/cola-salida-ia.js";
import { reprogramarOFallar } from "../jobs/dispatcher-campanas.js";
import { asegurarContacto } from "../lib/contactos.js";
import { ejecutarFlujosTrabajo } from "../lib/flujos-trabajo.js";
import { operadorOrigenDisponible, usuarioIdDesdeIdentidad } from "../lib/agentes.js";
import { iniciarConferenciaConAgentes } from "../lib/conferencia-agentes.js";
import { descartarFallbackCentral, reintentarDirectoSiCorresponde } from "../lib/fallback-central.js";
import { destinoDeTransferencia, extensionesDeTransferencia } from "../lib/enrutamiento.js";
import { esperaConfig } from "../lib/espera.js";
import { operadorDeLlamada } from "../lib/operador-origen.js";
import { terminarLlamadaTwilio } from "../lib/colgar.js";

/**
 * Webhooks de Twilio para la cuenta del cliente.
 * Fase 0: solo entrantes → graba + conecta al servidor de voz IA.
 * TODO Fase 1: resolver empresa por número destino (multi-tenant real),
 * no un solo ENV fijo.
 */
const MENSAJE_COLA =
  "Todos nuestros asesores están atendiendo otras llamadas. Por favor permanezca en línea, en breve lo atenderemos.";

/**
 * Lo que la espera necesita de la configuración de la empresa: su id (para que
 * el audio de espera sea el suyo) y, si la empresa definió un aviso, la frase
 * que se dice antes de esperar. Si falla la lectura, se usa lo de siempre.
 */
async function opcionesEspera(empresaId: string, avisoPorDefecto?: string) {
  const config = await esperaConfig(empresaId).catch(() => null);
  return { empresaId, mensajeEspera: config?.aviso ?? avisoPorDefecto };
}

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
        // Si la solicitud de API trajo un departamento, la llamada queda en él desde el principio.
        await pool.query(
          `UPDATE llamadas SET cola_id = w.cola_id
           FROM llamadas_webhook w
           WHERE w.id = $1 AND w.cola_id IS NOT NULL AND llamadas.call_sid = $2`,
          [webhookLlamadaId, callSid]
        );
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

      reply.type("text/xml").send(twimlEsperarConferencia({ conferenciaNombre, publicBaseUrl, ...(await opcionesEspera(empresaId)) }));
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

  async function soltarFinAlSalirAgentes(empresaId: string, conferenciaSid: string | undefined, agentesSids: string[]) {
    if (!conferenciaSid) return;
    const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
    if (!twilioEmpresa) return;
    const participantes = await twilioEmpresa.client.conferences(conferenciaSid).participants.list();
    await Promise.all(
      participantes
        .filter((p) => agentesSids.includes(p.callSid))
        .map((p) =>
          twilioEmpresa.client
            .conferences(conferenciaSid)
            .participants(p.callSid)
            .update({ endConferenceOnExit: false })
            .catch(() => {})
        )
    );
  }

  async function alSalirAgenteDeConferencia(llamadaId: string, callSidQueSale: string, conferenciaSid: string | undefined) {
    if (!conferenciaSid) return;
    const r = await pool.query<{
      empresa_id: string;
      agentes_call_sids: string[];
      agente_call_sid: string | null;
      agentes_call_sids_identidad: Record<string, string>;
    }>(
      "SELECT empresa_id, agentes_call_sids, agente_call_sid, agentes_call_sids_identidad FROM llamadas WHERE id = $1",
      [llamadaId]
    );
    const llamada = r.rows[0];
    // Solo cuenta la salida de un agente (no la del cliente ni la de un supervisor que escuchaba).
    if (!llamada || !llamada.agentes_call_sids.includes(callSidQueSale)) return;

    const twilioEmpresa = await clienteTwilioEmpresa(llamada.empresa_id);
    if (!twilioEmpresa) return;

    let participantes;
    try {
      participantes = await twilioEmpresa.client.conferences(conferenciaSid).participants.list();
    } catch {
      return; // la conferencia ya terminó
    }
    const agentesQueQuedan = participantes.filter((p) => llamada.agentes_call_sids.includes(p.callSid));

    if (agentesQueQuedan.length === 0) {
      // Se fue el último agente: se cuelga al cliente (y a quien esté escuchando).
      await twilioEmpresa.client
        .conferences(conferenciaSid)
        .update({ status: "completed" })
        .catch(() => {});
      return;
    }

    // Quedó otro agente atendiendo (transferencia entre agentes): la llamada pasa a ser suya — así se marca ocupado
    // él y no el que ya colgó.
    if (llamada.agente_call_sid === callSidQueSale) {
      const nuevo = agentesQueQuedan[0].callSid;
      const identidad = llamada.agentes_call_sids_identidad?.[nuevo];
      const usuarioId = identidad ? usuarioIdDesdeIdentidad(identidad) : null;
      await pool.query("UPDATE llamadas SET agente_call_sid = $2, agente_usuario_id = COALESCE($3, agente_usuario_id) WHERE id = $1", [
        llamadaId,
        nuevo,
        usuarioId,
      ]);
    }
  }

  // Cuando el primer agente entra a la conferencia, cancela las piernas de
  // los demás agentes que todavía estén timbrando (mismo comportamiento que
  // "el primero que conteste se la queda" del <Dial> con varios <Client>).
  app.post("/webhooks/twilio/conferencia-evento", async (req, reply) => {
    reply.send({ ok: true }); // responder ya, el resto corre aparte

    const body = req.body as Record<string, string>;
    const evento = body.StatusCallbackEvent;
    const friendlyName = body.FriendlyName; // "llamada-<id>"
    const callSid = body.CallSid;
    if (!friendlyName?.startsWith("llamada-") || !callSid) return;

    // Un agente se sale de la conferencia (ver más abajo cómo se llega a necesitar esto): si ya no queda ningún
    // agente, se termina la llamada del cliente; si queda otro (transferencia entre agentes), la llamada sigue y se
    // le pasa a él.
    if (evento === "participant-leave") {
      await alSalirAgenteDeConferencia(friendlyName.slice("llamada-".length), callSid, body.ConferenceSid).catch((err) =>
        app.log.error({ err, callSid }, "Error manejando la salida de un agente de la conferencia")
      );
      return;
    }
    if (evento !== "participant-join") return;

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

    if (row.agente_call_sid) {
      // Entra un SEGUNDO agente (transferencia entre agentes): ya no se puede dejar que el primero, al colgar, termine
      // la conferencia para todos — se quita ese comportamiento a todos los agentes y, cuando se sale el último, se
      // termina la llamada (ver "participant-leave" arriba).
      if (row.agente_call_sid !== callSid) {
        await soltarFinAlSalirAgentes(row.empresa_id, body.ConferenceSid, row.agentes_call_sids).catch((err) =>
          app.log.error({ err, callSid }, "No se pudo preparar la transferencia entre agentes")
        );
      }
      return;
    }

    // Resuelve qué agente contestó (para el panel de supervisión en vivo) a
    // partir de la identidad con la que se marcó esa pierna.
    const identidad = row.agentes_call_sids_identidad[callSid];
    const agenteUsuarioId = identidad ? usuarioIdDesdeIdentidad(identidad) : null;

    await pool.query(
      "UPDATE llamadas SET agente_call_sid = $2, agente_usuario_id = $3, estado = 'en_curso', en_cola_desde = NULL, respaldo_central_en = NULL WHERE id = $1",
      [llamadaId, callSid, agenteUsuarioId]
    );

    const twilioEmpresa = await clienteTwilioEmpresa(row.empresa_id);
    if (!twilioEmpresa) return;

    const otrasPiernas = row.agentes_call_sids.filter((sid) => sid !== callSid);
    await Promise.all(
      otrasPiernas.map((sid) =>
        terminarLlamadaTwilio(twilioEmpresa.client, sid) // ya contestada, ya colgada, etc. — no importa
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
      direccion: "entrante" | "saliente";
      numero_origen: string;
      numero_destino: string;
    }>(
      `SELECT id, empresa_id, cola_id, transferida, direccion, numero_origen, numero_destino
       FROM llamadas WHERE call_sid = $1`,
      [callSid]
    );
    const row = llamada.rows[0];

    if (!row?.transferida || !publicBaseUrl) {
      reply.type("text/xml").send(twimlColgar());
      return;
    }
    // Teléfono del cliente: viaja al navegador del asesor para mostrar quién llama
    // (si no, el panel mostraba el número de la empresa) y buscar su resumen exacto.
    const numeroCliente = row.direccion === "entrante" ? row.numero_origen : row.numero_destino;

    // Dónde se atiende (plataforma / central / ambos) lo decide la cola o,
    // si no tiene, la empresa — ver Configuración → Enrutamiento.
    const destino = await destinoDeTransferencia(row.empresa_id, row.cola_id);

    // La IA arranca una grabación al contestar y sigue activa tras transferir:
    // si ya hay una corriendo no se arranca otra (quedaría repetida); si por
    // algo no la hay, se arranca aquí para que ninguna llamada quede sin grabar.
    const twilioPost = await clienteTwilioEmpresa(row.empresa_id);
    const yaGrabando = await llamadaYaSeGraba(twilioPost, callSid);

    // Modo "Al operador que originó la llamada": si la plataforma externa dijo qué
    // operador disparó esta llamada de IA y está activo, la transferencia es para él.
    const operadorOrigenId = await operadorDeLlamada(callSid);
    const operadorElegido = await operadorOrigenDisponible(row.empresa_id, row.cola_id, operadorOrigenId);
    if (operadorElegido) app.log.info({ callSid, operadorElegido }, "Transferencia al operador que originó la llamada");

    if (destino !== "central") {
      const conferenciaNombre = `llamada-${row.id}`;
      const cola = await colaEsperaConfig(row.empresa_id);
      const hayAsesores = Boolean(operadorElegido) || (await hayAsesoresDisponibles(row.empresa_id, row.cola_id));

      // Sin asesores activos y con la cola de espera encendida: el cliente
      // espera en línea (con música) en vez de que se le cuelgue, y los
      // asesores lo ven en la pestaña "Cola" del panel de teléfono.
      if (!hayAsesores && cola.activa && destino === "plataforma") {
        await marcarEnCola(row.id, conferenciaNombre);
        app.log.info({ callSid, colaId: row.cola_id }, "Sin asesores disponibles: el cliente espera en la cola");
        reply.type("text/xml").send(
          twimlEsperarConferencia({
            conferenciaNombre,
            publicBaseUrl,
            grabar: !yaGrabando,
            ...(await opcionesEspera(row.empresa_id, MENSAJE_COLA)),
          })
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
          numeroCliente,
          operadorPreferidoId: operadorElegido,
        });

        if (identidades.length > 0) {
          app.log.info({ callSid, identidades }, "Transfiriendo llamada del bot a agente(s) disponible(s)");
          // Mientras nadie conteste, el cliente cuenta como "en cola" (la
          // conferencia-evento lo saca de ahí cuando un asesor entra).
          if (cola.activa) await marcarEnCola(row.id, conferenciaNombre);
          // "Plataforma primero, teléfonos de respaldo": si nadie contesta en lo
          // que dura el timbre, la llamada pasa sola a los teléfonos físicos.
          if (destino === "ambos" && twilioPost?.centralPropia?.entrante) {
            await programarRespaldoCentral(row.id, (twilioPost.timeoutTimbrado ?? 30) + 5);
          }
          reply.type("text/xml").send(twimlEsperarConferencia({ conferenciaNombre, publicBaseUrl, grabar: !yaGrabando, ...(await opcionesEspera(row.empresa_id)) }));
          return;
        }
      }
    }

    // A los teléfonos físicos (extensiones de la central): directo si el destino
    // es "central", o como respaldo si es "ambos" y no había asesores en la
    // plataforma. Requiere la central activa para entrantes y extensiones activas.
    let centralNoLista = false;
    if (destino !== "plataforma") {
      const resultado = await twimlParaCentral({
        empresaId: row.empresa_id,
        colaId: row.cola_id,
        callSid,
        publicBaseUrl,
        grabar: !yaGrabando,
        operadorUsuarioId: operadorOrigenId,
      });
      if ("twiml" in resultado) {
        app.log.info(
          { callSid, colaId: row.cola_id, destino, extensiones: resultado.extensiones },
          "Transfiriendo llamada de la IA a extensiones de la central propia"
        );
        reply.type("text/xml").send(resultado.twiml);
        return;
      }
      centralNoLista = true;
      app.log.warn(
        { callSid, destino, colaId: row.cola_id, motivo: resultado.motivo },
        resultado.motivo === "central_apagada"
          ? "Destino con teléfonos físicos, pero la central propia no está activa/con dominio o 'entrantes' está apagado"
          : "Destino con teléfonos físicos, pero no hay extensiones activas (ni del departamento ni generales)"
      );
    }

    // Destino "teléfonos físicos" pero la central no está lista: antes se le
    // colgaba al cliente; ahora, si hay asesores activos en la plataforma, se
    // le pasa a ellos para no perder la llamada.
    if (centralNoLista && destino === "central" && (Boolean(operadorElegido) || (await hayAsesoresDisponibles(row.empresa_id, row.cola_id)))) {
      const conferenciaNombre = `llamada-${row.id}`;
      const { identidades } = await iniciarConferenciaConAgentes({
        empresaId: row.empresa_id,
        llamadaId: row.id,
        conferenciaNombre,
        colaId: row.cola_id,
        publicBaseUrl,
        numeroCliente,
        operadorPreferidoId: operadorElegido,
      });
      if (identidades.length > 0) {
        app.log.warn({ callSid, identidades }, "La central no estaba lista: la llamada se pasó a asesores de la plataforma");
        reply.type("text/xml").send(twimlEsperarConferencia({ conferenciaNombre, publicBaseUrl, grabar: !yaGrabando, ...(await opcionesEspera(row.empresa_id)) }));
        return;
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
  app.post<{ Querystring: { callSid?: string; probadas?: string } }>(
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

      // Se marcó a un vendedor (el que originó la llamada, o uno al azar) y no contestó: se prueba otro
      // vendedor al azar (sin repetir) y, agotados los intentos, el grupo del departamento.
      const probadas = (req.query.probadas ?? "").split(",").map((e) => e.trim()).filter(Boolean);
      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (probadas.length > 0 && req.query.callSid && publicBaseUrl) {
        const fila = await pool.query<{ empresa_id: string; cola_id: string | null }>(
          "SELECT empresa_id, cola_id FROM llamadas WHERE call_sid = $1",
          [req.query.callSid]
        );
        const llamada = fila.rows[0];
        if (llamada) {
          const segunda = await twimlParaCentral({
            empresaId: llamada.empresa_id,
            colaId: llamada.cola_id,
            callSid: req.query.callSid,
            publicBaseUrl,
            grabar: false,
            excluir: probadas,
          });
          if ("twiml" in segunda) {
            app.log.info(
              { callSid: req.query.callSid, extensiones: segunda.extensiones },
              "El vendedor no contestó: se prueba la siguiente extensión (otro vendedor al azar o, al final, el grupo)"
            );
            reply.type("text/xml").send(segunda.twiml);
            return;
          }
        }
      }
      reply
        .type("text/xml")
        .send(twimlColgar("En este momento no hay agentes disponibles. Por favor intente más tarde."));
    }
  );

  app.post<{ Querystring: { campanaContactoId?: string; empresaId?: string; numero?: string; salienteNormal?: string } }>(
    "/webhooks/twilio/call-status",
    async (req, reply) => {
      const body = req.body as Record<string, string>;
      const { CallSid: callSid, CallStatus: status, CallDuration: duration } = body;
      const { campanaContactoId, empresaId, numero, salienteNormal } = req.query;

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

      // La llamada de la cola de salida (API / flujos) terminó: libera su lugar y, si hay llamadas esperando, sale la siguiente.
      if (["completed", "busy", "no-answer", "failed", "canceled"].includes(status)) {
        marcarTerminadaEnCola(callSid)
          .then(() => despacharColaIA())
          .catch((err) => app.log.error({ err, callSid }, "Error liberando la cola de salida"));
      }

      // Una llamada que terminó ya no espera en la cola (el cliente colgó, etc.).
      if (["completed", "busy", "no-answer", "failed", "canceled"].includes(status)) {
        await pool
          .query(
          "UPDATE llamadas SET en_cola_desde = NULL, respaldo_central_en = NULL WHERE call_sid = $1 AND (en_cola_desde IS NOT NULL OR respaldo_central_en IS NOT NULL)",
          [callSid]
        )
          .catch(() => {});
      }

      // La llamada terminó SIN contestarse (ocupado, no contesta, número inexistente, cancelada, falló). Antes no se
      // anotaba en ningún lado: la fila quedaba "en curso" para siempre (o ni existía, y el panel de teléfono se
      // quedaba en "Marcando…"). Ahora queda "fallida" y cierra; una llamada normal (panel / click-to-call) que nunca
      // llegó a tener fila se crea ya cerrada para que el panel se entere.
      if (["busy", "no-answer", "failed", "canceled"].includes(status)) {
        const cerrada = await pool
          .query(
            `UPDATE llamadas SET estado = 'fallida', finalizada_en = now()
             WHERE call_sid = $1 AND estado = 'en_curso' AND finalizada_en IS NULL
             RETURNING id`,
            [callSid]
          )
          .catch(() => ({ rows: [] as unknown[] }));
        if (cerrada.rows.length === 0 && salienteNormal === "1" && empresaId && !campanaContactoId) {
          await pool
            .query(
              `INSERT INTO llamadas (empresa_id, call_sid, direccion, numero_origen, numero_destino, estado, finalizada_en)
               VALUES ($1, $2, 'saliente', $3, $4, 'fallida', now())
               ON CONFLICT (call_sid) DO NOTHING`,
              [empresaId, callSid, body.From ?? "", numero || body.To || ""]
            )
            .catch((err) => app.log.error({ err, callSid }, "No se pudo registrar la llamada saliente fallida"));
        }
      }

      if (status === "completed") {
        // Una llamada que la IA colgó sola porque contestó un buzón / una grabación (o que un asesor cerró porque no
        // contestaba nadie) NO es una llamada completada: queda "fallida".
        await pool.query(
          `UPDATE llamadas
           SET estado = CASE WHEN resultado_automatico IS NOT NULL THEN 'fallida' ELSE 'completada' END,
               duracion_segundos = $2, finalizada_en = now()
           WHERE call_sid = $1`,
          [callSid, duration ? parseInt(duration, 10) : null]
        );
        // Un asesor pudo quedar libre: si hay clientes esperando, se le timbra el primero.
        const base = process.env.PUBLIC_BASE_URL;
        if (base) {
          asignarColaAAsesoresLibres(base).catch((err) => app.log.error({ err }, "Error asignando la cola de espera"));
        }
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
          resultado_automatico: string | null;
        }>(
          "SELECT id, empresa_id, direccion, numero_origen, numero_destino, transferida, resultado_automatico FROM llamadas WHERE call_sid = $1",
          [callSid]
        );
        const l = llamada.rows[0];
        if (l) {
          const disparador =
            status === "completed" && !l.resultado_automatico
              ? l.transferida
                ? "llamada_transferida"
                : "llamada_completada"
              : "llamada_no_contesta";
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
          const auto = await pool.query<{ resultado_automatico: string | null }>(
            "SELECT resultado_automatico FROM llamadas WHERE call_sid = $1",
            [callSid]
          );
          const tipoAuto = auto.rows[0]?.resultado_automatico;
          if (tipoAuto === "numero_inexistente") {
            // Número que no existe: reintentar no sirve de nada.
            await pool.query(`UPDATE campana_contactos SET estado = 'fallida' WHERE id = $1`, [campanaContactoId]);
          } else if (tipoAuto) {
            // Buzón de voz / nadie contestó: cuenta como "no contestó" y se reintenta como cualquier otro.
            const contacto = await pool.query<{ campana_id: string }>(
              "SELECT campana_id FROM campana_contactos WHERE id = $1",
              [campanaContactoId]
            );
            if (contacto.rows[0]) await reprogramarOFallar(campanaContactoId, contacto.rows[0].campana_id);
          } else {
            await pool.query(`UPDATE campana_contactos SET estado = 'completada' WHERE id = $1`, [
              campanaContactoId,
            ]);
          }
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
