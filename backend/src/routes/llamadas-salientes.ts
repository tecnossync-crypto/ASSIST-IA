import type { FastifyInstance } from "fastify";
import twilio from "twilio";
import { pool } from "../db/pool.js";
import { desencriptar } from "../lib/crypto.js";

/**
 * Dispara una llamada saliente desde el dashboard: la plataforma llama al
 * número que le des, usando el Twilio de la empresa. Fase 1: sin auth
 * todavía, mismo TODO que el resto de /api — no exponer sin resolver login.
 */
export async function llamadasSalientesRoutes(app: FastifyInstance) {
  app.post<{ Body: { empresaId: string; numero: string } }>(
    "/api/llamadas/salientes",
    async (req, reply) => {
      const { empresaId, numero } = req.body;

      if (!empresaId || !numero) {
        reply.code(400).send({ error: "empresaId y numero son requeridos" });
        return;
      }

      const empresa = await pool.query<{
        twilio_account_sid: string | null;
        twilio_auth_token_enc: string | null;
        twilio_phone_number: string | null;
      }>(
        "SELECT twilio_account_sid, twilio_auth_token_enc, twilio_phone_number FROM empresas WHERE id = $1",
        [empresaId]
      );

      const row = empresa.rows[0];
      if (!row?.twilio_account_sid || !row.twilio_auth_token_enc || !row.twilio_phone_number) {
        reply.code(400).send({ error: "La empresa no tiene credenciales Twilio configuradas" });
        return;
      }

      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!publicBaseUrl) {
        reply.code(500).send({ error: "PUBLIC_BASE_URL no está configurado" });
        return;
      }

      const authToken = desencriptar(row.twilio_auth_token_enc);
      const client = twilio(row.twilio_account_sid, authToken);

      try {
        const call = await client.calls.create({
          to: numero,
          from: row.twilio_phone_number,
          url: `${publicBaseUrl}/webhooks/twilio/voice-outbound?empresaId=${empresaId}`,
          method: "POST",
          statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
          statusCallbackMethod: "POST",
          statusCallbackEvent: ["completed"],
        });

        app.log.info({ callSid: call.sid, numero }, "Llamada saliente originada");
        reply.send({ ok: true, callSid: call.sid });
      } catch (err) {
        app.log.error({ err, numero }, "Error originando llamada saliente");
        reply.code(502).send({ error: "No se pudo originar la llamada", detalle: String(err) });
      }
    }
  );
}
