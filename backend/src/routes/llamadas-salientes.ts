import type { FastifyInstance } from "fastify";
import { clienteTwilioEmpresa } from "../lib/twilio-empresa.js";

/**
 * Dispara una llamada saliente manual desde el dashboard (botón "Llamar
 * ahora"): la plataforma llama al número que le des, usando el Twilio de la
 * empresa. Fase 1: sin auth todavía, mismo TODO que el resto de /api.
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

      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!publicBaseUrl) {
        reply.code(500).send({ error: "PUBLIC_BASE_URL no está configurado" });
        return;
      }

      const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
      if (!twilioEmpresa) {
        reply.code(400).send({ error: "La empresa no tiene credenciales Twilio configuradas" });
        return;
      }

      try {
        const call = await twilioEmpresa.client.calls.create({
          to: numero,
          from: twilioEmpresa.fromNumber,
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
