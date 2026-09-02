import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * API de lectura del módulo de contactos: el perfil acumulado de cada
 * cliente (nombre, apellido, teléfono + lo que se haya capturado en
 * `datos`), independiente de cualquier llamada individual. Fase 1: sin
 * auth todavía, mismo TODO que el resto de /api.
 */
export async function contactosRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string; q?: string; limite?: string; offset?: string } }>(
    "/api/contactos",
    async (req, reply) => {
      const { empresaId, q, limite, offset } = req.query;
      if (!empresaId) {
        reply.code(400).send({ error: "empresaId es requerido" });
        return;
      }

      const condiciones = ["empresa_id = $1"];
      const valores: unknown[] = [empresaId];

      if (q) {
        valores.push(`%${q}%`);
        const idx = valores.length;
        condiciones.push(`(numero ILIKE $${idx} OR nombre ILIKE $${idx} OR apellido ILIKE $${idx})`);
      }

      const lim = Math.min(parseInt(limite ?? "50", 10) || 50, 200);
      const off = parseInt(offset ?? "0", 10) || 0;
      valores.push(lim, off);

      const result = await pool.query(
        `SELECT id, numero, nombre, apellido, datos, creado_en, actualizado_en
         FROM contactos
         WHERE ${condiciones.join(" AND ")}
         ORDER BY actualizado_en DESC
         LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores
      );

      reply.send({ contactos: result.rows });
    }
  );

  app.get<{ Params: { id: string } }>("/api/contactos/:id", async (req, reply) => {
    const { id } = req.params;

    const contacto = await pool.query(
      `SELECT id, empresa_id, numero, nombre, apellido, notas, datos, creado_en, actualizado_en
       FROM contactos WHERE id = $1`,
      [id]
    );
    if (contacto.rows.length === 0) {
      reply.code(404).send({ error: "no encontrado" });
      return;
    }
    const row = contacto.rows[0];

    const llamadas = await pool.query(
      `SELECT id, direccion, estado, duracion_segundos, iniciada_en
       FROM llamadas
       WHERE empresa_id = $1 AND (numero_origen = $2 OR numero_destino = $2)
       ORDER BY iniciada_en DESC
       LIMIT 20`,
      [row.empresa_id, row.numero]
    );

    reply.send({ contacto: row, llamadas: llamadas.rows });
  });
}
