import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * CRUD de flujos de trabajo: reglas "cuando termina una llamada así, hacer
 * esto" (agregar etiqueta o crear una solicitud de seguimiento). La
 * ejecución real vive en lib/flujos-trabajo.ts, llamada desde el webhook
 * de call-status. Fase 1: sin auth todavía, mismo TODO que el resto de /api.
 */
export async function flujosTrabajoRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/flujos-trabajo", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const result = await pool.query(
      `SELECT id, nombre, disparador, accion, accion_datos, activo, creado_en
       FROM flujos_trabajo WHERE empresa_id = $1 ORDER BY creado_en DESC`,
      [empresaId]
    );
    reply.send({ flujos: result.rows });
  });

  app.post<{
    Body: {
      empresaId: string;
      nombre: string;
      disparador: string;
      accion: string;
      accionDatos: Record<string, string>;
    };
  }>("/api/flujos-trabajo", async (req, reply) => {
    const { empresaId, nombre, disparador, accion, accionDatos } = req.body;

    if (!empresaId || !nombre || !disparador || !accion) {
      reply.code(400).send({ error: "empresaId, nombre, disparador y accion son requeridos" });
      return;
    }

    const result = await pool.query<{ id: string }>(
      `INSERT INTO flujos_trabajo (empresa_id, nombre, disparador, accion, accion_datos)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [empresaId, nombre, disparador, accion, JSON.stringify(accionDatos ?? {})]
    );
    reply.send({ ok: true, id: result.rows[0].id });
  });

  app.post<{ Params: { id: string } }>("/api/flujos-trabajo/:id/activar", async (req, reply) => {
    await pool.query("UPDATE flujos_trabajo SET activo = true WHERE id = $1", [req.params.id]);
    reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>("/api/flujos-trabajo/:id/desactivar", async (req, reply) => {
    await pool.query("UPDATE flujos_trabajo SET activo = false WHERE id = $1", [req.params.id]);
    reply.send({ ok: true });
  });

  app.delete<{ Params: { id: string } }>("/api/flujos-trabajo/:id", async (req, reply) => {
    await pool.query("DELETE FROM flujos_trabajo WHERE id = $1", [req.params.id]);
    reply.send({ ok: true });
  });
}
