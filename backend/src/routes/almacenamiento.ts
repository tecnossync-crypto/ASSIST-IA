import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * Reporte de uso de almacenamiento (Configuración → Almacenamiento):
 * cuánto espacio ocupan las grabaciones guardadas ahora mismo. Se calcula
 * desde la base de datos (tamano_bytes por grabación), no consultando S3
 * cada vez.
 */
export async function almacenamientoRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/almacenamiento", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const [resumen, porMes] = await Promise.all([
      pool.query<{ total_bytes: string | null; total_grabaciones: string }>(
        `SELECT COALESCE(SUM(tamano_bytes), 0) AS total_bytes, COUNT(*) AS total_grabaciones
         FROM grabaciones WHERE empresa_id = $1`,
        [empresaId]
      ),
      pool.query<{ mes: string; bytes: string | null; cantidad: string }>(
        `SELECT to_char(date_trunc('month', creado_en), 'YYYY-MM') AS mes,
                COALESCE(SUM(tamano_bytes), 0) AS bytes, COUNT(*) AS cantidad
         FROM grabaciones
         WHERE empresa_id = $1 AND creado_en >= now() - interval '6 months'
         GROUP BY 1 ORDER BY 1`,
        [empresaId]
      ),
    ]);

    reply.send({
      totalBytes: Number(resumen.rows[0].total_bytes ?? 0),
      totalGrabaciones: Number(resumen.rows[0].total_grabaciones),
      porMes: porMes.rows.map((r) => ({ mes: r.mes, bytes: Number(r.bytes ?? 0), cantidad: Number(r.cantidad) })),
    });
  });
}
