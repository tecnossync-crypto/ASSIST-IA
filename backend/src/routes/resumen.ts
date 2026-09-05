import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * Métricas para el dashboard de inicio: KPIs de llamadas de hoy, y
 * satisfacción evaluada por el bot (últimos 30 días, ya que día a día hay
 * muy pocas llamadas para que el % diga algo).
 */
export async function resumenRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string; colaId?: string } }>("/api/resumen", async (req, reply) => {
    const { empresaId, colaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    // Un agente (rol operador) solo debe ver los números de su propia cola —
    // el dashboard pasa esto cuando quien pide el resumen no es admin.
    const filtroCola = colaId ? "AND cola_id = $2" : "";
    const paramsLlamadas = colaId ? [empresaId, colaId] : [empresaId];

    const [llamadas, campanas, satisfaccion, porDia] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE iniciada_en >= date_trunc('day', now())) AS llamadas_hoy,
           COUNT(*) FILTER (WHERE estado = 'en_curso') AS llamadas_activas,
           COUNT(*) FILTER (WHERE transferida AND iniciada_en >= date_trunc('day', now())) AS transferidas_hoy,
           COUNT(*) FILTER (WHERE direccion = 'entrante' AND iniciada_en >= date_trunc('day', now())) AS entrantes_hoy,
           COUNT(*) FILTER (WHERE direccion = 'saliente' AND iniciada_en >= date_trunc('day', now())) AS salientes_hoy,
           COUNT(*) FILTER (WHERE estado = 'completada' AND iniciada_en >= date_trunc('day', now())) AS completadas_hoy,
           COUNT(*) FILTER (WHERE estado = 'fallida' AND iniciada_en >= date_trunc('day', now())) AS fallidas_hoy
         FROM llamadas WHERE empresa_id = $1 ${filtroCola}`,
        paramsLlamadas
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE estado = 'en_curso') AS campanas_activas
         FROM campanas WHERE empresa_id = $1`,
        [empresaId]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE t.satisfaccion = 'positiva') AS positivas,
           COUNT(*) FILTER (WHERE t.satisfaccion = 'neutral') AS neutrales,
           COUNT(*) FILTER (WHERE t.satisfaccion = 'negativa') AS negativas,
           COUNT(*) FILTER (WHERE t.satisfaccion IS NOT NULL) AS total_evaluadas
         FROM transcripciones t
         JOIN llamadas l ON l.id = t.llamada_id
         WHERE t.empresa_id = $1 AND l.iniciada_en >= now() - interval '30 days' ${filtroCola.replace("cola_id", "l.cola_id")}`,
        paramsLlamadas
      ),
      pool.query(
        `SELECT
           to_char(date_trunc('day', iniciada_en), 'YYYY-MM-DD') AS dia,
           COUNT(*) FILTER (WHERE direccion = 'entrante') AS entrantes,
           COUNT(*) FILTER (WHERE direccion = 'saliente') AS salientes
         FROM llamadas
         WHERE empresa_id = $1 AND iniciada_en >= now() - interval '7 days' ${filtroCola}
         GROUP BY 1 ORDER BY 1`,
        paramsLlamadas
      ),
    ]);

    const s = satisfaccion.rows[0];
    const totalEvaluadas = Number(s.total_evaluadas);
    const porcentajePositiva = totalEvaluadas > 0 ? Math.round((Number(s.positivas) / totalEvaluadas) * 100) : null;

    reply.send({
      ...llamadas.rows[0],
      ...campanas.rows[0],
      satisfaccion: {
        positivas: Number(s.positivas),
        neutrales: Number(s.neutrales),
        negativas: Number(s.negativas),
        total_evaluadas: totalEvaluadas,
        porcentaje_positiva: porcentajePositiva,
      },
      llamadas_por_dia: porDia.rows,
    });
  });
}
