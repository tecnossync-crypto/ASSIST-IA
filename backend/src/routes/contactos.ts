import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * API de lectura del módulo de contactos: el perfil acumulado de cada
 * cliente (nombre, apellido, teléfono + lo que se haya capturado en
 * `datos`), independiente de cualquier llamada individual. Fase 1: sin
 * auth todavía, mismo TODO que el resto de /api.
 */
export async function contactosRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { empresaId?: string; q?: string; etiqueta?: string; limite?: string; offset?: string };
  }>("/api/contactos", async (req, reply) => {
      const { empresaId, q, etiqueta, limite, offset } = req.query;
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

      if (etiqueta) {
        valores.push(etiqueta);
        condiciones.push(`$${valores.length} = ANY(etiquetas)`);
      }

      const lim = Math.min(parseInt(limite ?? "50", 10) || 50, 200);
      const off = parseInt(offset ?? "0", 10) || 0;
      valores.push(lim, off);

      const result = await pool.query(
        `SELECT id, numero, nombre, apellido, datos, etiquetas, creado_en, actualizado_en
         FROM contactos
         WHERE ${condiciones.join(" AND ")}
         ORDER BY actualizado_en DESC
         LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores
      );

      reply.send({ contactos: result.rows });
    }
  );

  // Importación masiva (CSV desde el dashboard). Upsert por (empresa, numero):
  // si ya existe el contacto, solo rellena nombre/apellido si venían vacíos
  // (no pisa datos ya capturados por el agente en llamadas reales).
  app.post<{
    Body: { empresaId: string; contactos: { numero: string; nombre?: string; apellido?: string }[] };
  }>("/api/contactos/importar", async (req, reply) => {
    const { empresaId, contactos } = req.body;
    if (!empresaId || !contactos?.length) {
      reply.code(400).send({ error: "empresaId y al menos un contacto son requeridos" });
      return;
    }

    let insertados = 0;
    let actualizados = 0;

    for (const c of contactos) {
      if (!c.numero) continue;
      const result = await pool.query(
        `INSERT INTO contactos (empresa_id, numero, nombre, apellido)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (empresa_id, numero) DO UPDATE SET
           nombre = COALESCE(contactos.nombre, EXCLUDED.nombre),
           apellido = COALESCE(contactos.apellido, EXCLUDED.apellido),
           actualizado_en = now()
         RETURNING (xmax = 0) AS es_nuevo`,
        [empresaId, c.numero, c.nombre ?? null, c.apellido ?? null]
      );
      if (result.rows[0]?.es_nuevo) insertados++;
      else actualizados++;
    }

    reply.send({ ok: true, insertados, actualizados });
  });

  app.put<{ Params: { id: string }; Body: { etiquetas: string[] } }>(
    "/api/contactos/:id/etiquetas",
    async (req, reply) => {
      const { id } = req.params;
      const { etiquetas } = req.body;

      const result = await pool.query(
        `UPDATE contactos SET etiquetas = $2, actualizado_en = now() WHERE id = $1 RETURNING id`,
        [id, etiquetas ?? []]
      );
      if (result.rows.length === 0) {
        reply.code(404).send({ error: "no encontrado" });
        return;
      }
      reply.send({ ok: true });
    }
  );

  app.get<{ Params: { id: string } }>("/api/contactos/:id", async (req, reply) => {
    const { id } = req.params;

    const contacto = await pool.query(
      `SELECT id, empresa_id, numero, nombre, apellido, notas, datos, etiquetas, creado_en, actualizado_en
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
