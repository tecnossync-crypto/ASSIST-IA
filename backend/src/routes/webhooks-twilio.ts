import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import {
  twimlConnectVoiceAgent,
  twimlDialHumano,
  twimlColgar,
  twimlEsperarConferencia,
  twimlUnirseConferenciaComoAgente,
} from "../lib/twiml.js";
import { clienteTwilioEmpresa } from "../lib/twilio-empresa.js";
import { procesarGrabacion } from "../jobs/procesar-grabacion.js";
import { reprogramarOFallar } from "../jobs/dispatcher-campanas.js";
import { asegurarContacto } from "../lib/contactos.js";
import { ejecutarFlujosTrabajo } from "../lib/flujos-trabajo.js";
import { usuarioIdDesdeIdentidad } from "../lib/agentes.js";
import { iniciarConferenciaConAgentes } from "../lib/conferencia-agentes.js";

/**
 * Webhooks de Twilio para la cuenta del cliente.
 * Fase 0: solo entrantes → graba + conecta al servidor de voz IA.
 * TODO Fase 1: resolver empresa por número destino (multi-tenant real),
 * no un solo ENV fijo.
 */
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
  app.post<{ Querystring: { empresaId?: string; campanaContactoId?: string; webhookLlamadaId?: string } }>(
    "/webhooks/twilio/voice-outbound",
    async (req, reply) => {
      const body = req.body as Record<string, string>;
      const callSid = body.CallSid;
      const from = body.From;
      const to = body.To;
      const { empresaId, campanaContactoId, webhookLlamadaId } = req.query;

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
  app.post<{ Querystring: { empresaId?: string; colaId?: string } }>(
    "/webhooks/twilio/voice-normal",
    async (req, reply) => {
      const { empresaId, colaId } = req.query;
      const body = req.body as Record<string, string>;
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
      const llamada = await pool.query<{ id: string }>(
        `INSERT INTO llamadas (empresa_id, call_sid, direccion, numero_origen, numero_destino, estado, cola_id)
         VALUES ($1, $2, 'saliente', $3, $4, 'en_curso', $5)
         ON CONFLICT (call_sid) DO UPDATE SET call_sid = EXCLUDED.call_sid
         RETURNING id`,
        [empresaId, body.CallSid, body.From, body.To, colaId ?? null]
      );
      const llamadaId = llamada.rows[0].id;
      const conferenciaNombre = `llamada-${llamadaId}`;
      await asegurarContacto(empresaId, body.To);

      const { identidades } = await iniciarConferenciaConAgentes({
        empresaId,
        llamadaId,
        conferenciaNombre,
        colaId,
        publicBaseUrl,
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
      "UPDATE llamadas SET agente_call_sid = $2, agente_usuario_id = $3, estado = 'en_curso' WHERE id = $1",
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
  // que "llamada normal" — así el bot no depende de un número fijo y el
  // admin puede monitorear la transferencia igual que cualquier otra
  // llamada en Supervisión. `transferencia_destino`, si el bot lo dio, solo
  // se usa como número externo de RESPALDO si no hay ningún agente
  // disponible en este momento.
  app.post("/webhooks/twilio/post-relay", async (req, reply) => {
    const body = req.body as Record<string, string>;
    const callSid = body.CallSid;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;

    const llamada = await pool.query<{
      id: string;
      empresa_id: string;
      cola_id: string | null;
      transferida: boolean;
      transferencia_destino: string | null;
    }>(
      "SELECT id, empresa_id, cola_id, transferida, transferencia_destino FROM llamadas WHERE call_sid = $1",
      [callSid]
    );
    const row = llamada.rows[0];

    if (!row?.transferida || !publicBaseUrl) {
      reply.type("text/xml").send(twimlColgar());
      return;
    }

    const conferenciaNombre = `llamada-${row.id}`;
    const { identidades } = await iniciarConferenciaConAgentes({
      empresaId: row.empresa_id,
      llamadaId: row.id,
      conferenciaNombre,
      colaId: row.cola_id,
      publicBaseUrl,
    });

    if (identidades.length > 0) {
      app.log.info({ callSid, identidades }, "Transfiriendo llamada del bot a agente(s) disponible(s)");
      reply.type("text/xml").send(twimlEsperarConferencia({ conferenciaNombre, publicBaseUrl }));
      return;
    }

    // Sin agentes disponibles: si el bot (o la empresa) dio un número
    // externo de respaldo, se usa; si no, no queda más remedio que colgar.
    if (row.transferencia_destino) {
      app.log.info({ callSid, destino: row.transferencia_destino }, "Sin agentes — transfiriendo a número externo de respaldo");
      reply.type("text/xml").send(twimlDialHumano(row.transferencia_destino));
      return;
    }

    app.log.warn({ callSid }, "Transferencia sin agentes disponibles ni número de respaldo");
    reply
      .type("text/xml")
      .send(twimlColgar("En este momento no hay agentes disponibles. Por favor intente más tarde."));
  });

  app.post<{ Querystring: { campanaContactoId?: string } }>(
    "/webhooks/twilio/call-status",
    async (req, reply) => {
      const body = req.body as Record<string, string>;
      const { CallSid: callSid, CallStatus: status, CallDuration: duration } = body;
      const { campanaContactoId } = req.query;

      app.log.info({ callSid, status, duration, campanaContactoId }, "Actualización de estado de llamada");

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
