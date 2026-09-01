import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { twimlConnectVoiceAgent, twimlDialHumano, twimlColgar } from "../lib/twiml.js";

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
    const empresa = await pool.query<{ id: string }>(
      "SELECT id FROM empresas WHERE twilio_phone_number = $1 LIMIT 1",
      [to]
    );

    if (empresa.rows.length === 0) {
      app.log.warn({ to }, "No hay empresa configurada para este número");
      reply.type("text/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-MX">Este número no está configurado todavía.</Say></Response>`
      );
      return;
    }

    const empresaId = empresa.rows[0].id;

    await pool.query(
      `INSERT INTO llamadas (empresa_id, call_sid, direccion, numero_origen, numero_destino, estado)
       VALUES ($1, $2, 'entrante', $3, $4, 'en_curso')
       ON CONFLICT (call_sid) DO NOTHING`,
      [empresaId, callSid, from, to]
    );

    const voiceWsUrl = process.env.VOICE_WS_URL;
    if (!voiceWsUrl) {
      throw new Error("VOICE_WS_URL no está configurado");
    }

    const twiml = twimlConnectVoiceAgent({ voiceWsUrl, empresaId, callSid });
    reply.type("text/xml").send(twiml);
  });

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

  app.post("/webhooks/twilio/call-status", async (req, reply) => {
    const body = req.body as Record<string, string>;
    const { CallSid: callSid, CallStatus: status, CallDuration: duration } = body;

    app.log.info({ callSid, status, duration }, "Actualización de estado de llamada");

    if (status === "completed") {
      await pool.query(
        `UPDATE llamadas
         SET estado = 'completada', duracion_segundos = $2, finalizada_en = now()
         WHERE call_sid = $1`,
        [callSid, duration ? parseInt(duration, 10) : null]
      );
    }

    reply.send({ ok: true });
  });

  app.post("/webhooks/twilio/recording-status", async (req, reply) => {
    const body = req.body as Record<string, string>;
    app.log.info(body, "Grabación lista en Twilio");

    // TODO Fase 0/1: job que descarga la grabación desde Twilio Recordings API,
    // la sube a storage propio (R2/S3), calcula hash de integridad,
    // inserta en `grabaciones`, y borra el original en Twilio.

    reply.send({ ok: true });
  });
}
