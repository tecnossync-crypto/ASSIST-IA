import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * Métricas rápidas para la pantalla de inicio del dashboard. Una sola
 * consulta agregada en vez de que el frontend calcule esto reprocesando
 * listas completas.
 */
export async function resumenRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/resumen", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const [llamadas, campanas] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE iniciada_en >= date_trunc('day', now())) AS llamadas_hoy,
           COUNT(*) FILTER (WHERE estado = 'en_curso') AS llamadas_activas,
           COUNT(*) FILTER (WHERE transferida AND iniciada_en >= date_trunc('day', now())) AS transferidas_hoy,
           COUNT(*) FILTER (WHERE direccion = 'entrante' AND iniciada_en >= date_trunc('day', now())) AS entrantes_hoy,
           COUNT(*) FILTER (WHERE direccion = 'saliente' AND iniciada_en >= date_trunc('day', now())) AS salientes_hoy
         FROM llamadas WHERE empresa_id = $1`,
        [empresaId]
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE estado = 'en_curso') AS campanas_activas
         FROM campanas WHERE empresa_id = $1`,
        [empresaId]
      ),
    ]);

    reply.send({ ...llamadas.rows[0], ...campanas.rows[0] });
  });
}
