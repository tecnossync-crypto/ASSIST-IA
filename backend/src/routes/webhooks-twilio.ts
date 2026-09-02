import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { twimlConnectVoiceAgent, twimlDialHumano, twimlColgar } from "../lib/twiml.js";
import { procesarGrabacion } from "../jobs/procesar-grabacion.js";
import { reprogramarOFallar } from "../jobs/dispatcher-campanas.js";
import { asegurarContacto } from "../lib/contactos.js";
import { ejecutarFlujosTrabajo } from "../lib/flujos-trabajo.js";

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
    const empresa = await pool.query<{ id: string; voz_agente: string | null }>(
      "SELECT id, voz_agente FROM empresas WHERE twilio_phone_number = $1 LIMIT 1",
      [to]
    );

    if (empresa.rows.length === 0) {
      app.log.warn({ to }, "No hay empresa configurada para este número");
      reply.type("text/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-MX">Este número no está configurado todavía.</Say></Response>`
      );
      return;
    }

    const { id: empresaId, voz_agente: voz } = empresa.rows[0];

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

    const twiml = twimlConnectVoiceAgent({ voiceWsUrl, empresaId, callSid, voz, publicBaseUrl });
    reply.type("text/xml").send(twiml);
  });

  // Twilio llega acá cuando contestan una llamada saliente que nosotros
  // originamos (ver POST /api/llamadas/salientes). empresaId viaja en la
  // query string porque nosotros armamos esta URL al crear la llamada.
  app.post<{ Querystring: { empresaId?: string; campanaContactoId?: string } }>(
    "/webhooks/twilio/voice-outbound",
    async (req, reply) => {
      const body = req.body as Record<string, string>;
      const callSid = body.CallSid;
      const from = body.From;
      const to = body.To;
      const { empresaId, campanaContactoId } = req.query;

      app.log.info({ callSid, from, to, empresaId, campanaContactoId }, "Llamada saliente contestada");

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

      const voiceWsUrl = process.env.VOICE_WS_URL;
      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!voiceWsUrl) throw new Error("VOICE_WS_URL no está configurado");
      if (!publicBaseUrl) throw new Error("PUBLIC_BASE_URL no está configurado");

      const voz = await pool.query<{ voz_agente: string | null }>(
        "SELECT voz_agente FROM empresas WHERE id = $1",
        [empresaId]
      );

      reply.type("text/xml").send(
        twimlConnectVoiceAgent({
          voiceWsUrl,
          empresaId,
          callSid,
          voz: voz.rows[0]?.voz_agente ?? null,
          campanaContactoId,
          publicBaseUrl,
        })
      );
    }
  );

  // Se ejecuta cuando ConversationRelay termina (el agente mandó "end" o la
  // llamada se cayó) y TwiML cae al <Redirect> puesto después de <Connect>.
  // Si el agente marcó transferencia, aquí sale el <Dial> real; si no, cuelga.
  app.post("/webhooks/twilio/post-relay", async (req, reply) => {
    const body = req.body as Record<string, string>;
    const callSid = body.CallSid;

    const llamada = await pool.query<{ transferencia_destino: string | null }>(
      "SELECT transferencia_destino FROM llamadas WHERE call_sid = $1",
      [callSid]
    );

    const destino = llamada.rows[0]?.transferencia_destino ?? null;

    if (destino) {
      app.log.info({ callSid, destino }, "Transfiriendo llamada a humano");
      reply.type("text/xml").send(twimlDialHumano(destino));
      return;
    }

    reply.type("text/xml").send(twimlColgar());
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
