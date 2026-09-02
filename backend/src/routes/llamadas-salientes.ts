import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "../lib/twilio-empresa.js";

/**
 * Dispara llamadas salientes manuales desde el dashboard (panel de
 * teléfono): dos modos —
 * - /salientes: la IA contesta y lleva la conversación (como cualquier otra
 *   llamada saliente de la plataforma).
 * - /normal: el cliente se conecta directo con un humano (número de
 *   transferencia configurado), sin que la IA participe.
 * Fase 1: sin auth todavía, mismo TODO que el resto de /api.
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
          timeout: twilioEmpresa.timeoutTimbrado,
        });

        app.log.info({ callSid: call.sid, numero }, "Llamada saliente (IA) originada");
        reply.send({ ok: true, callSid: call.sid });
      } catch (err) {
        app.log.error({ err, numero }, "Error originando llamada saliente");
        reply.code(502).send({ error: "No se pudo originar la llamada", detalle: String(err) });
      }
    }
  );

  app.post<{ Body: { empresaId: string; numero: string } }>(
    "/api/llamadas/normal",
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

      const empresa = await pool.query<{ numeros_transferencia: string[] }>(
        "SELECT numeros_transferencia FROM empresas WHERE id = $1",
        [empresaId]
      );
      const destino = empresa.rows[0]?.numeros_transferencia?.[0];
      if (!destino) {
        reply.code(400).send({ error: "No hay un número de transferencia configurado (Configuración → Empresa)" });
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
          url: `${publicBaseUrl}/webhooks/twilio/voice-normal?destino=${encodeURIComponent(destino)}`,
          method: "POST",
          statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
          statusCallbackMethod: "POST",
          statusCallbackEvent: ["completed"],
          timeout: twilioEmpresa.timeoutTimbrado,
        });

        app.log.info({ callSid: call.sid, numero, destino }, "Llamada normal (humano) originada");
        reply.send({ ok: true, callSid: call.sid });
      } catch (err) {
        app.log.error({ err, numero }, "Error originando llamada normal");
        reply.code(502).send({ error: "No se pudo originar la llamada", detalle: String(err) });
      }
    }
  );
}
