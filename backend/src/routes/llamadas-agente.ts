import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "../lib/twilio-empresa.js";
import { identidadAgente } from "../lib/agentes.js";

/**
 * Controles del agente durante una "llamada normal" ya conectada (mute lo
 * resuelve el propio Twilio Voice SDK en el navegador, sin backend — ver
 * Softphone.tsx). Acá lo que sí necesita la API de Twilio:
 * - Poner al CLIENTE en espera (hold), con música, sin colgar a nadie.
 * - Traer a otro agente a la MISMA conferencia (transferencia con
 *   acompañamiento — el agente actual se queda hasta que decide colgar su
 *   propia pierna, como una transferencia "caliente" normal de call center).
 *
 * `agenteCallSid` es el CallSid de la PIERNA del agente que está pidiendo
 * la acción (call.parameters.CallSid del lado del navegador) — se usa para
 * encontrar en qué llamada/conferencia está, sin que el agente tenga que
 * conocer el id interno de la llamada.
 */
export async function llamadasAgenteRoutes(app: FastifyInstance) {
  async function buscarLlamadaDeAgente(agenteCallSid: string) {
    const result = await pool.query<{
      id: string;
      empresa_id: string;
      conferencia_nombre: string | null;
      call_sid: string;
    }>(
      `SELECT id, empresa_id, conferencia_nombre, call_sid FROM llamadas
       WHERE (agente_call_sid = $1 OR $1 = ANY(agentes_call_sids)) AND estado = 'en_curso'
       ORDER BY iniciada_en DESC LIMIT 1`,
      [agenteCallSid]
    );
    return result.rows[0] ?? null;
  }

  app.post<{ Body: { agenteCallSid: string; activar: boolean } }>(
    "/api/llamadas/agente/hold",
    async (req, reply) => {
      const { agenteCallSid, activar } = req.body;
      if (!agenteCallSid || typeof activar !== "boolean") {
        reply.code(400).send({ error: "agenteCallSid y activar son requeridos" });
        return;
      }

      const llamada = await buscarLlamadaDeAgente(agenteCallSid);
      if (!llamada?.conferencia_nombre) {
        reply.code(404).send({ error: "No se encontró la llamada en curso para este agente" });
        return;
      }

      const twilioEmpresa = await clienteTwilioEmpresa(llamada.empresa_id);
      if (!twilioEmpresa) {
        reply.code(400).send({ error: "La empresa no tiene credenciales Twilio configuradas" });
        return;
      }
      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!publicBaseUrl) {
        reply.code(500).send({ error: "PUBLIC_BASE_URL no está configurado" });
        return;
      }

      try {
        const conferencias = await twilioEmpresa.client.conferences.list({
          friendlyName: llamada.conferencia_nombre,
          status: "in-progress",
          limit: 1,
        });
        const conferencia = conferencias[0];
        if (!conferencia) {
          reply.code(400).send({ error: "La conferencia ya no está activa" });
          return;
        }

        await twilioEmpresa.client
          .conferences(conferencia.sid)
          .participants(llamada.call_sid)
          .update(
            activar
              ? { hold: true, holdUrl: `${publicBaseUrl}/webhooks/twilio/musica-espera`, holdMethod: "POST" }
              : { hold: false }
          );
        reply.send({ ok: true });
      } catch (err) {
        app.log.error({ err, agenteCallSid }, "Error cambiando estado de espera del cliente");
        reply.code(502).send({ error: "No se pudo cambiar el estado de espera", detalle: String(err) });
      }
    }
  );

  app.post<{ Body: { agenteCallSid: string; nuevoAgenteUsuarioId: string } }>(
    "/api/llamadas/agente/transferir",
    async (req, reply) => {
      const { agenteCallSid, nuevoAgenteUsuarioId } = req.body;
      if (!agenteCallSid || !nuevoAgenteUsuarioId) {
        reply.code(400).send({ error: "agenteCallSid y nuevoAgenteUsuarioId son requeridos" });
        return;
      }

      const llamada = await buscarLlamadaDeAgente(agenteCallSid);
      if (!llamada?.conferencia_nombre) {
        reply.code(404).send({ error: "No se encontró la llamada en curso para este agente" });
        return;
      }

      const twilioEmpresa = await clienteTwilioEmpresa(llamada.empresa_id);
      if (!twilioEmpresa) {
        reply.code(400).send({ error: "La empresa no tiene credenciales Twilio configuradas" });
        return;
      }
      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!publicBaseUrl) {
        reply.code(500).send({ error: "PUBLIC_BASE_URL no está configurado" });
        return;
      }

      const agenteUrl = `${publicBaseUrl}/webhooks/twilio/conferencia-agente?conferencia=${encodeURIComponent(llamada.conferencia_nombre)}`;
      try {
        const call = await twilioEmpresa.client.calls.create({
          to: `client:${identidadAgente(nuevoAgenteUsuarioId)}`,
          from: twilioEmpresa.fromNumber,
          url: agenteUrl,
          method: "POST",
          timeout: twilioEmpresa.timeoutTimbrado,
        });
        await pool.query(`UPDATE llamadas SET agentes_call_sids = array_append(agentes_call_sids, $2) WHERE id = $1`, [
          llamada.id,
          call.sid,
        ]);
        reply.send({ ok: true, callSid: call.sid });
      } catch (err) {
        app.log.error({ err, agenteCallSid, nuevoAgenteUsuarioId }, "Error trayendo a otro agente a la conferencia");
        reply.code(502).send({ error: "No se pudo llamar al otro agente", detalle: String(err) });
      }
    }
  );

  // TwiML de música de espera para cuando un agente pone al cliente en hold
  // (ver /agente/hold arriba) — Twilio la pide cada vez que necesita volver
  // a reproducir el audio de espera (loop="0" = infinito hasta que se quite
  // el hold).
  app.post("/webhooks/twilio/musica-espera", async (_req, reply) => {
    reply.type("text/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Play loop="0">https://demo.twilio.com/docs/classic.mp3</Play></Response>`
    );
  });
}
