import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { urlFirmadaGrabacion } from "../lib/storage.js";

/**
 * API de lectura para el dashboard. Fase 1: sin autenticación todavía
 * (usuarios/roles no están implementados) — TODO bloqueante antes de dar
 * acceso a más de una empresa: hoy asume que solo hay un tenant y no
 * verifica de quién es la sesión. No exponer este backend públicamente
 * sin resolver eso primero.
 */
export async function llamadasRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { empresaId?: string; q?: string; estado?: string; limite?: string; offset?: string };
  }>("/api/llamadas", async (req, reply) => {
    const { empresaId, q, estado, limite, offset } = req.query;

    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const condiciones = ["l.empresa_id = $1"];
    const valores: unknown[] = [empresaId];

    if (estado) {
      valores.push(estado);
      condiciones.push(`l.estado = $${valores.length}`);
    }

    if (q) {
      valores.push(`%${q}%`);
      const idx = valores.length;
      condiciones.push(
        `(l.numero_origen ILIKE $${idx} OR l.numero_destino ILIKE $${idx} OR t.resumen_motivo ILIKE $${idx} OR t.resumen_solicitud ILIKE $${idx})`
      );
    }

    const lim = Math.min(parseInt(limite ?? "50", 10) || 50, 200);
    const off = parseInt(offset ?? "0", 10) || 0;
    valores.push(lim, off);

    const result = await pool.query(
      `SELECT
         l.id, l.call_sid, l.direccion, l.numero_origen, l.numero_destino,
         l.estado, l.transferida, l.duracion_segundos, l.iniciada_en, l.finalizada_en,
         t.resumen_motivo, t.resumen_solicitud, t.resumen_resultado, t.accion_pendiente
       FROM llamadas l
       LEFT JOIN transcripciones t ON t.llamada_id = l.id
       WHERE ${condiciones.join(" AND ")}
       ORDER BY l.iniciada_en DESC
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores
    );

    reply.send({ llamadas: result.rows });
  });

  app.get<{ Params: { id: string } }>("/api/llamadas/:id", async (req, reply) => {
    const { id } = req.params;

    const llamada = await pool.query(
      `SELECT id, empresa_id, call_sid, direccion, numero_origen, numero_destino,
              estado, transferida, transferencia_destino, duracion_segundos, iniciada_en, finalizada_en
       FROM llamadas WHERE id = $1`,
      [id]
    );

    if (llamada.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }

    const [transcripcion, grabacion, datos] = await Promise.all([
      pool.query(
        `SELECT texto_completo, resumen_motivo, resumen_solicitud, resumen_resultado, accion_pendiente
         FROM transcripciones WHERE llamada_id = $1 ORDER BY creado_en DESC LIMIT 1`,
        [id]
      ),
      pool.query(
        `SELECT url_storage, duracion_segundos, hash_integridad
         FROM grabaciones WHERE llamada_id = $1 ORDER BY creado_en DESC LIMIT 1`,
        [id]
      ),
      pool.query(`SELECT campo, valor FROM datos_llamada WHERE llamada_id = $1 ORDER BY creado_en`, [id]),
    ]);

    let audioUrl: string | null = null;
    const grabacionRow = grabacion.rows[0];
    if (grabacionRow) {
      audioUrl = await urlFirmadaGrabacion(grabacionRow.url_storage).catch((err) => {
        app.log.error(err, "No se pudo firmar la URL de la grabación");
        return null;
      });
    }

    reply.send({
      llamada: llamada.rows[0],
      transcripcion: transcripcion.rows[0] ?? null,
      grabacion: grabacionRow ? { ...grabacionRow, audioUrl } : null,
      datos: datos.rows,
    });
  });
}
