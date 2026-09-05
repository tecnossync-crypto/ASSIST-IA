import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * Registro de auditoría: qué cambió en Configuración, cuándo, y quién lo
 * hizo. El dashboard llama a POST después de cada acción de Configuración
 * que se guarda con éxito.
 */
export async function auditoriaRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      empresaId: string;
      usuarioId?: string | null;
      usuarioNombre: string;
      accion: string;
      entidad: string;
      detalle?: Record<string, unknown>;
    };
  }>("/api/auditoria", async (req, reply) => {
    const { empresaId, usuarioId, usuarioNombre, accion, entidad, detalle } = req.body;
    if (!empresaId || !usuarioNombre || !accion || !entidad) {
      reply.code(400).send({ error: "empresaId, usuarioNombre, accion y entidad son requeridos" });
      return;
    }

    await pool.query(
      `INSERT INTO auditoria (empresa_id, usuario_id, usuario_nombre, accion, entidad, detalle)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [empresaId, usuarioId || null, usuarioNombre, accion, entidad, JSON.stringify(detalle ?? {})]
    );

    reply.send({ ok: true });
  });

  app.get<{ Querystring: { empresaId?: string; limite?: string; offset?: string } }>(
    "/api/auditoria",
    async (req, reply) => {
      const { empresaId, limite, offset } = req.query;
      if (!empresaId) {
        reply.code(400).send({ error: "empresaId es requerido" });
        return;
      }

      const lim = Math.min(parseInt(limite ?? "50", 10) || 50, 200);
      const off = parseInt(offset ?? "0", 10) || 0;

      const result = await pool.query(
        `SELECT id, usuario_nombre, accion, entidad, detalle, creado_en
         FROM auditoria WHERE empresa_id = $1
         ORDER BY creado_en DESC LIMIT $2 OFFSET $3`,
        [empresaId, lim, off]
      );

      reply.send({ registros: result.rows });
    }
  );
}
