import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "../lib/twilio-empresa.js";
import { identidadAgente } from "../lib/agentes.js";

/**
 * Monitoreo de llamadas en vivo: el admin se une a la conferencia de una
 * "llamada normal" en curso para escuchar (sin que nadie lo note) y,
 * opcionalmente, intervenir. Requiere que la llamada ya tenga un agente
 * conectado — no hay nada que escuchar antes de eso.
 *
 * IMPORTANTE (mismo TODO que el resto de /api en Fase 1): este backend no
 * valida sesión ni rol — quien decide si el que llama es admin es el
 * dashboard (Next.js), antes de invocar este endpoint. No exponer este
 * backend directamente sin resolver auth real primero.
 */
export async function monitoreoRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Body: { adminUsuarioId: string } }>(
    "/api/llamadas/:id/escuchar",
    async (req, reply) => {
      const { id } = req.params;
      const { adminUsuarioId } = req.body;
      if (!adminUsuarioId) {
        reply.code(400).send({ error: "adminUsuarioId es requerido" });
        return;
      }

      const llamada = await pool.query<{
        empresa_id: string;
        estado: string;
        conferencia_nombre: string | null;
        agente_call_sid: string | null;
      }>(
        "SELECT empresa_id, estado, conferencia_nombre, agente_call_sid FROM llamadas WHERE id = $1",
        [id]
      );
      const row = llamada.rows[0];
      if (!row) {
        reply.code(404).send({ error: "no encontrada" });
        return;
      }
      if (!row.conferencia_nombre || !row.agente_call_sid || row.estado !== "en_curso") {
        reply.code(400).send({ error: "La llamada todavía no tiene un agente conectado, o ya terminó" });
        return;
      }

      const twilioEmpresa = await clienteTwilioEmpresa(row.empresa_id);
      if (!twilioEmpresa) {
        reply.code(400).send({ error: "La empresa no tiene credenciales Twilio configuradas" });
        return;
      }

      try {
        const conferencias = await twilioEmpresa.client.conferences.list({
          friendlyName: row.conferencia_nombre,
          status: "in-progress",
          limit: 1,
        });
        const conferencia = conferencias[0];
        if (!conferencia) {
          reply.code(400).send({ error: "La conferencia ya no está activa" });
          return;
        }

        // muted=true: el admin escucha todo, pero nadie lo escucha a él —
        // exactamente "escuchar sin ser notado". Para "intervenir" se
        // desmuta este mismo participante (ver /intervenir abajo).
        const participante = await twilioEmpresa.client
          .conferences(conferencia.sid)
          .participants.create({
            from: twilioEmpresa.fromNumber,
            to: `client:${identidadAgente(adminUsuarioId)}`,
            muted: true,
            endConferenceOnExit: false,
          });

        reply.send({ ok: true, conferenciaSid: conferencia.sid, participanteCallSid: participante.callSid });
      } catch (err) {
        app.log.error({ err, id }, "Error uniendo admin a monitorear llamada");
        reply.code(502).send({ error: "No se pudo unir a la llamada", detalle: String(err) });
      }
    }
  );

  // Intervenir: desmuta al admin dentro de la conferencia en la que ya está
  // escuchando (ver arriba). A partir de ahí habla como un tercero en la
  // llamada — cliente y agente lo escuchan a él también (no es un "susurro"
  // privado solo al agente; eso requeriría re-unirlo con `coaching`, pendiente
  // si se necesita esa variante más adelante).
  app.post<{ Body: { conferenciaSid: string; participanteCallSid: string; activar: boolean; empresaId: string } }>(
    "/api/llamadas/intervenir",
    async (req, reply) => {
      const { conferenciaSid, participanteCallSid, activar, empresaId } = req.body;
      if (!conferenciaSid || !participanteCallSid || !empresaId || typeof activar !== "boolean") {
        reply.code(400).send({ error: "conferenciaSid, participanteCallSid, empresaId y activar son requeridos" });
        return;
      }

      const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
      if (!twilioEmpresa) {
        reply.code(400).send({ error: "La empresa no tiene credenciales Twilio configuradas" });
        return;
      }

      try {
        await twilioEmpresa.client
          .conferences(conferenciaSid)
          .participants(participanteCallSid)
          .update({ muted: !activar });
        reply.send({ ok: true });
      } catch (err) {
        app.log.error({ err, conferenciaSid }, "Error cambiando modo de intervención");
        reply.code(502).send({ error: "No se pudo cambiar de modo", detalle: String(err) });
      }
    }
  );

  // Colgar solo la pierna del admin (dejar de escuchar/intervenir) sin
  // afectar la llamada entre cliente y agente.
  app.post<{ Body: { participanteCallSid: string; empresaId: string } }>(
    "/api/llamadas/dejar-de-escuchar",
    async (req, reply) => {
      const { participanteCallSid, empresaId } = req.body;
      if (!participanteCallSid || !empresaId) {
        reply.code(400).send({ error: "participanteCallSid y empresaId son requeridos" });
        return;
      }

      const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
      if (!twilioEmpresa) {
        reply.code(400).send({ error: "La empresa no tiene credenciales Twilio configuradas" });
        return;
      }

      await twilioEmpresa.client
        .calls(participanteCallSid)
        .update({ status: "completed" })
        .catch(() => {});
      reply.send({ ok: true });
    }
  );
}
