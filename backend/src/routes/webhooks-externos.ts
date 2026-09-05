import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { empresaPorApiKey } from "../lib/api-keys.js";
import { clienteTwilioEmpresa } from "../lib/twilio-empresa.js";
import { asegurarContacto } from "../lib/contactos.js";

/**
 * Webhook público para que plataformas externas (un CRM, un e-commerce, un
 * sistema de tickets, etc.) pidan que la plataforma llame a un cliente con
 * IA. Se autentica con el API key de la empresa (Configuración →
 * Integraciones), no con sesión de dashboard — este endpoint SÍ está
 * pensado para exponerse a internet.
 */
export async function webhooksExternosRoutes(app: FastifyInstance) {
  app.post<{
    Body: { numero: string; prompt?: string; origen?: string };
    Headers: { "x-api-key"?: string };
  }>("/api/webhooks/llamadas", async (req, reply) => {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      reply.code(401).send({ error: "Falta el header x-api-key" });
      return;
    }

    const empresa = await empresaPorApiKey(apiKey);
    if (!empresa) {
      reply.code(401).send({ error: "API key inválido" });
      return;
    }
    const empresaId = empresa.id;

    const { numero, prompt, origen } = req.body ?? {};
    if (!numero || typeof numero !== "string" || !/^\+?[\d\s()-]{7,}$/.test(numero)) {
      reply.code(400).send({ error: "numero es requerido y debe ser un teléfono válido (ej. +18095551234)" });
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

    const solicitud = await pool.query<{ id: string }>(
      `INSERT INTO llamadas_webhook (empresa_id, numero, prompt, origen) VALUES ($1, $2, $3, $4) RETURNING id`,
      [empresaId, numero, prompt ?? null, origen ?? null]
    );
    const llamadaWebhookId = solicitud.rows[0].id;

    await asegurarContacto(empresaId, numero);

    try {
      const call = await twilioEmpresa.client.calls.create({
        to: numero,
        from: twilioEmpresa.fromNumber,
        url: `${publicBaseUrl}/webhooks/twilio/voice-outbound?empresaId=${empresaId}&webhookLlamadaId=${llamadaWebhookId}`,
        method: "POST",
        statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["completed"],
        timeout: twilioEmpresa.timeoutTimbrado,
      });

      app.log.info({ callSid: call.sid, numero, origen }, "Llamada originada vía webhook externo");
      reply.send({ ok: true, callSid: call.sid, id: llamadaWebhookId });
    } catch (err) {
      app.log.error({ err, numero }, "Error originando llamada vía webhook externo");
      reply.code(502).send({ error: "No se pudo originar la llamada", detalle: String(err) });
    }
  });
}
