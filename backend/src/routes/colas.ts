import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * Colas de atención (ej. "Ventas", "Soporte"): grupos de agentes con su
 * propio modo de reparto. Un agente pertenece a una sola cola (o ninguna).
 */
export async function colasRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/colas", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const result = await pool.query(
      `SELECT c.id, c.nombre, c.enrutamiento,
              (SELECT count(*) FROM usuarios u WHERE u.cola_id = c.id) AS agentes_asignados
       FROM colas c WHERE c.empresa_id = $1 ORDER BY c.creado_en`,
      [empresaId]
    );
    reply.send({ colas: result.rows });
  });

  app.post<{ Body: { empresaId: string; nombre: string } }>("/api/colas", async (req, reply) => {
    const { empresaId, nombre } = req.body;
    if (!empresaId || !nombre?.trim()) {
      reply.code(400).send({ error: "empresaId y nombre son requeridos" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO colas (empresa_id, nombre) VALUES ($1, $2) RETURNING id, nombre, enrutamiento`,
      [empresaId, nombre.trim()]
    );
    reply.send({ ok: true, cola: result.rows[0] });
  });

  app.put<{ Params: { id: string }; Body: { modo: "todos" | "round_robin" | "disponibilidad" } }>(
    "/api/colas/:id/enrutamiento",
    async (req, reply) => {
      const { id } = req.params;
      const { modo } = req.body;
      if (!["todos", "round_robin", "disponibilidad"].includes(modo)) {
        reply.code(400).send({ error: "modo inválido" });
        return;
      }

      const result = await pool.query(
        `UPDATE colas SET enrutamiento = jsonb_set(enrutamiento, '{modo}', to_jsonb($2::text))
         WHERE id = $1 RETURNING id`,
        [id, modo]
      );
      if (result.rows.length === 0) {
        reply.code(404).send({ error: "no encontrada" });
        return;
      }
      reply.send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string } }>("/api/colas/:id", async (req, reply) => {
    const { id } = req.params;
    // Los agentes de esta cola quedan sin cola (no se borran).
    await pool.query("UPDATE usuarios SET cola_id = NULL WHERE cola_id = $1", [id]);
    await pool.query("DELETE FROM colas WHERE id = $1", [id]);
    reply.send({ ok: true });
  });
}
