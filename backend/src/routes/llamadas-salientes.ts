import type { FastifyInstance } from "fastify";
import { clienteTwilioEmpresa } from "../lib/twilio-empresa.js";
import { generarTokenVoz } from "../lib/voice-token.js";

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

  app.post<{ Body: { empresaId: string; numero: string; colaId?: string | null } }>(
    "/api/llamadas/normal",
    async (req, reply) => {
      const { empresaId, numero, colaId } = req.body;

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

      const parametroCola = colaId ? `&colaId=${encodeURIComponent(colaId)}` : "";

      try {
        const call = await twilioEmpresa.client.calls.create({
          to: numero,
          from: twilioEmpresa.fromNumber,
          // Quién contesta (uno o varios agentes, según el enrutamiento de
          // la cola elegida o de la empresa) se decide en
          // /webhooks/twilio/voice-normal, al momento en que el cliente
          // contesta — no acá al originar.
          url: `${publicBaseUrl}/webhooks/twilio/voice-normal?empresaId=${empresaId}${parametroCola}`,
          method: "POST",
          statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
          statusCallbackMethod: "POST",
          statusCallbackEvent: ["completed"],
          timeout: twilioEmpresa.timeoutTimbrado,
        });

        app.log.info({ callSid: call.sid, numero, colaId }, "Llamada normal (softphone) originada");
        reply.send({ ok: true, callSid: call.sid });
      } catch (err) {
        app.log.error({ err, numero }, "Error originando llamada normal");
        reply.code(502).send({ error: "No se pudo originar la llamada", detalle: String(err) });
      }
    }
  );

  // Token de Twilio Voice SDK para que un softphone (navegador del
  // dashboard, o el ejecutable de escritorio ya logueado con usuarioId) se
  // registre y pueda recibir las llamadas "normales" (ver arriba).
  app.get<{ Querystring: { empresaId?: string; usuarioId?: string } }>("/api/voice-token", async (req, reply) => {
    const { empresaId, usuarioId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const resultado = await generarTokenVoz(empresaId, usuarioId);
    if (!resultado) {
      reply.code(400).send({ error: "La empresa no tiene credenciales de softphone configuradas" });
      return;
    }

    reply.send(resultado);
  });

  // Colgar manualmente desde el dashboard (botón "Colgar" del panel de
  // teléfono). No depende de que el otro lado cuelgue primero ni de esperar
  // el webhook de Twilio — termina la llamada ya mismo en la API de Twilio;
  // el webhook de call-status llega después y solo confirma en la BD.
  app.post<{ Body: { empresaId: string; callSid: string } }>("/api/llamadas/colgar", async (req, reply) => {
    const { empresaId, callSid } = req.body;
    if (!empresaId || !callSid) {
      reply.code(400).send({ error: "empresaId y callSid son requeridos" });
      return;
    }

    const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
    if (!twilioEmpresa) {
      reply.code(400).send({ error: "La empresa no tiene credenciales Twilio configuradas" });
      return;
    }

    try {
      await twilioEmpresa.client.calls(callSid).update({ status: "completed" });
      reply.send({ ok: true });
    } catch (err) {
      // Si ya estaba colgada (ej. el otro lado colgó primero), Twilio
      // responde con error — no es un fallo real desde la perspectiva del
      // usuario, la llamada de todos modos ya terminó.
      app.log.warn({ err, callSid }, "Error colgando llamada (puede que ya estuviera terminada)");
      reply.send({ ok: true });
    }
  });
}
