import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * Eliminar una etiqueta o un campo personalizado del catálogo de la empresa
 * (Configuración → Contactos) y limpiarlo de TODOS los contactos que lo
 * tienen, para no dejar datos huérfanos. Los contactos se conservan.
 * Fase 1: sin auth todavía — por eso toda consulta filtra por empresa_id.
 *
 * - Etiqueta: sale del catálogo y de contactos.etiquetas. Los flujos activos
 *   que la usan (como disparador "se agrega la etiqueta X" o como acción
 *   "agregar la etiqueta X") quedan DESACTIVADOS, no borrados, porque ya no
 *   pueden funcionar.
 * - Campo: sale del catálogo y de la clave correspondiente en contactos.datos
 *   (los valores se guardan por el nombre del campo). El historial de datos
 *   que la IA capturó en cada llamada (datos_llamada) no se toca: es el
 *   registro de lo que se dijo en esa llamada.
 */
export async function catalogoContactosRoutes(app: FastifyInstance) {
  const FLUJOS_DE_ETIQUETA = `
    empresa_id = $1 AND activo = true AND (
      (disparador_datos ->> 'etiqueta' = $2)
      OR (accion = 'agregar_etiqueta' AND accion_datos ->> 'etiqueta' = $2)
    )`;

  // Etiquetas y campos que SIGUEN guardados en contactos pero ya no están en
  // el catálogo de la empresa (ej. se borraron antes de que la eliminación
  // limpiara los contactos). Se quitan con los mismos DELETE de abajo.
  app.get<{ Querystring: { empresaId?: string } }>("/api/etiquetas/huerfanas", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }
    const r = await pool.query<{ nombre: string; contactos: number }>(
      `SELECT t AS nombre, count(*)::int AS contactos
       FROM contactos c, unnest(c.etiquetas) AS t
       WHERE c.empresa_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM empresas e, jsonb_array_elements(e.etiquetas_disponibles) x
           WHERE e.id = $1 AND x ->> 'nombre' = t)
       GROUP BY t ORDER BY t`,
      [empresaId]
    );
    reply.send({ etiquetas: r.rows });
  });

  app.get<{ Querystring: { empresaId?: string } }>("/api/campos-personalizados/huerfanos", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }
    const r = await pool.query<{ nombre: string; contactos: number }>(
      `SELECT k AS nombre, count(*)::int AS contactos
       FROM contactos c, jsonb_object_keys(c.datos) AS k
       WHERE c.empresa_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM empresas e, jsonb_array_elements(e.campos_personalizados) x
           WHERE e.id = $1 AND x ->> 'nombre' = k)
       GROUP BY k ORDER BY k`,
      [empresaId]
    );
    reply.send({ campos: r.rows });
  });

  app.get<{ Querystring: { empresaId?: string; nombre?: string } }>(
    "/api/etiquetas/impacto",
    async (req, reply) => {
      const { empresaId, nombre } = req.query;
      if (!empresaId || !nombre?.trim()) {
        reply.code(400).send({ error: "empresaId y nombre son requeridos" });
        return;
      }
      const [contactos, flujos] = await Promise.all([
        pool.query<{ total: string }>(
          "SELECT count(*) AS total FROM contactos WHERE empresa_id = $1 AND $2 = ANY(etiquetas)",
          [empresaId, nombre]
        ),
        pool.query<{ id: string; nombre: string }>(
          `SELECT id, nombre FROM flujos_trabajo WHERE ${FLUJOS_DE_ETIQUETA} ORDER BY nombre`,
          [empresaId, nombre]
        ),
      ]);
      reply.send({ contactos: Number(contactos.rows[0].total), flujos: flujos.rows });
    }
  );

  app.delete<{ Querystring: { empresaId?: string; nombre?: string } }>("/api/etiquetas", async (req, reply) => {
    const { empresaId, nombre } = req.query;
    if (!empresaId || !nombre?.trim()) {
      reply.code(400).send({ error: "empresaId y nombre son requeridos" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE empresas SET etiquetas_disponibles = COALESCE(
           (SELECT jsonb_agg(e) FROM jsonb_array_elements(etiquetas_disponibles) e WHERE e ->> 'nombre' <> $2),
           '[]'::jsonb)
         WHERE id = $1`,
        [empresaId, nombre]
      );
      const contactos = await client.query(
        `UPDATE contactos SET etiquetas = array_remove(etiquetas, $2), actualizado_en = now()
         WHERE empresa_id = $1 AND $2 = ANY(etiquetas)`,
        [empresaId, nombre]
      );
      const flujos = await client.query(
        `UPDATE flujos_trabajo SET activo = false WHERE ${FLUJOS_DE_ETIQUETA}`,
        [empresaId, nombre]
      );
      await client.query("COMMIT");
      reply.send({ ok: true, contactosActualizados: contactos.rowCount, flujosDesactivados: flujos.rowCount });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  app.get<{ Querystring: { empresaId?: string; nombre?: string } }>(
    "/api/campos-personalizados/impacto",
    async (req, reply) => {
      const { empresaId, nombre } = req.query;
      if (!empresaId || !nombre?.trim()) {
        reply.code(400).send({ error: "empresaId y nombre son requeridos" });
        return;
      }
      const [contactos, registros] = await Promise.all([
        pool.query<{ total: string }>(
          "SELECT count(*) AS total FROM contactos WHERE empresa_id = $1 AND datos ? $2",
          [empresaId, nombre]
        ),
        pool.query<{ total: string }>(
          "SELECT count(*) AS total FROM datos_llamada WHERE empresa_id = $1 AND campo = $2",
          [empresaId, nombre]
        ),
      ]);
      reply.send({ contactos: Number(contactos.rows[0].total), registros: Number(registros.rows[0].total) });
    }
  );

  app.delete<{ Querystring: { empresaId?: string; nombre?: string } }>(
    "/api/campos-personalizados",
    async (req, reply) => {
      const { empresaId, nombre } = req.query;
      if (!empresaId || !nombre?.trim()) {
        reply.code(400).send({ error: "empresaId y nombre son requeridos" });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE empresas SET campos_personalizados = COALESCE(
             (SELECT jsonb_agg(c) FROM jsonb_array_elements(campos_personalizados) c WHERE c ->> 'nombre' <> $2),
             '[]'::jsonb)
           WHERE id = $1`,
          [empresaId, nombre]
        );
        const contactos = await client.query(
          `UPDATE contactos SET datos = datos - $2::text, actualizado_en = now()
           WHERE empresa_id = $1 AND datos ? $2::text`,
          [empresaId, nombre]
        );
        // También el historial de lo que la IA capturó con este campo en
        // llamadas (se pidió eliminarlo "de todas partes"). Lo que quedó
        // escrito dentro de una transcripción o resumen ya generado no se
        // puede separar y se conserva.
        const registros = await client.query(
          "DELETE FROM datos_llamada WHERE empresa_id = $1 AND campo = $2",
          [empresaId, nombre]
        );
        await client.query("COMMIT");
        reply.send({
          ok: true,
          contactosActualizados: contactos.rowCount,
          registrosEliminados: registros.rowCount,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  );
}
