import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * Seguimiento por vendedor: los clientes a los que se les llamó (con IA o por un asesor), qué necesitan según el resumen
 * de la última conversación y cuándo volver a contactarlos. El vendedor solo ve los suyos (los que tiene asignados y los
 * que atendió); un administrador puede verlos todos o filtrar por vendedor.
 */

/** Condición SQL (alias `c` = contactos): el contacto es del usuario o es un cliente que él atendió. */
const SQL_VISIBLE_PARA = (n: number) => `(c.propietario_usuario_id = $${n} OR EXISTS (
           SELECT 1 FROM llamadas lv
           WHERE lv.empresa_id = c.empresa_id AND lv.agente_usuario_id = $${n}
             AND (lv.numero_origen = c.numero OR lv.numero_destino = c.numero)))`;

const FILTROS = ["todos", "pendientes", "vencidos", "por_programar"] as const;

export async function seguimientoRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { empresaId?: string; visiblePara?: string; propietarioId?: string; filtro?: string; q?: string };
  }>("/api/seguimiento", async (req, reply) => {
    const { empresaId, visiblePara, propietarioId, q } = req.query;
    if (!empresaId) return reply.code(400).send({ error: "empresaId es requerido" });
    const filtro = (FILTROS as readonly string[]).includes(req.query.filtro ?? "") ? req.query.filtro : "todos";

    const condiciones = ["c.empresa_id = $1"];
    const valores: unknown[] = [empresaId];
    if (visiblePara) {
      valores.push(visiblePara);
      condiciones.push(SQL_VISIBLE_PARA(valores.length));
    }
    if (propietarioId) {
      valores.push(propietarioId);
      condiciones.push(`c.propietario_usuario_id = $${valores.length}`);
    }
    if (q) {
      valores.push(`%${q}%`);
      const i = valores.length;
      condiciones.push(`(c.numero ILIKE $${i} OR c.nombre ILIKE $${i} OR c.apellido ILIKE $${i})`);
    }
    if (filtro === "pendientes") condiciones.push("c.seguimiento_estado = 'pendiente'");
    if (filtro === "vencidos") condiciones.push("c.seguimiento_estado = 'pendiente' AND c.seguimiento_fecha <= now()");
    if (filtro === "por_programar") {
      condiciones.push("(c.seguimiento_estado IS DISTINCT FROM 'pendiente') AND ur.accion_pendiente IS NOT NULL AND btrim(ur.accion_pendiente) <> ''");
    }

    const r = await pool.query(
      `SELECT c.id, c.numero, c.nombre, c.apellido, c.etiquetas, c.propietario_usuario_id, pu.nombre AS propietario_nombre,
              c.seguimiento_fecha, c.seguimiento_nota, c.seguimiento_estado, c.seguimiento_origen,
              ul.iniciada_en AS ultima_llamada_en, ul.direccion AS ultima_direccion, ul.estado AS ultima_estado,
              ul.total_llamadas,
              ur.iniciada_en AS resumen_en, ur.resumen_motivo, ur.resumen_solicitud, ur.resumen_resultado,
              ur.accion_pendiente, ur.satisfaccion, ur.llamada_id
       FROM contactos c
       LEFT JOIN usuarios pu ON pu.id = c.propietario_usuario_id
       JOIN LATERAL (
         SELECT l.iniciada_en, l.direccion, l.estado, COUNT(*) OVER () AS total_llamadas
         FROM llamadas l
         WHERE l.empresa_id = c.empresa_id
           AND (l.contacto_id = c.id OR l.numero_origen = c.numero OR l.numero_destino = c.numero)
         ORDER BY l.iniciada_en DESC LIMIT 1
       ) ul ON true
       LEFT JOIN LATERAL (
         SELECT l.id AS llamada_id, l.iniciada_en, t.resumen_motivo, t.resumen_solicitud, t.resumen_resultado,
                t.accion_pendiente, t.satisfaccion
         FROM llamadas l JOIN transcripciones t ON t.llamada_id = l.id
         WHERE l.empresa_id = c.empresa_id
           AND (l.contacto_id = c.id OR l.numero_origen = c.numero OR l.numero_destino = c.numero)
         ORDER BY l.iniciada_en DESC LIMIT 1
       ) ur ON true
       WHERE ${condiciones.join(" AND ")}
       ORDER BY (c.seguimiento_estado = 'pendiente' AND c.seguimiento_fecha <= now()) DESC NULLS LAST,
                (c.seguimiento_estado = 'pendiente') DESC NULLS LAST,
                c.seguimiento_fecha ASC NULLS LAST,
                ul.iniciada_en DESC
       LIMIT 300`,
      valores
    );
    return { clientes: r.rows };
  });

  // Programa, edita o marca como hecho el seguimiento de un cliente.
  app.put<{
    Params: { id: string };
    Body: {
      empresaId?: string;
      visiblePara?: string;
      estado?: "pendiente" | "hecho" | null;
      fecha?: string | null;
      nota?: string | null;
    };
  }>("/api/contactos/:id/seguimiento", async (req, reply) => {
    const { id } = req.params;
    const { empresaId, visiblePara, estado } = req.body ?? {};
    if (!empresaId) return reply.code(400).send({ error: "empresaId es requerido" });
    if (estado !== null && estado !== undefined && estado !== "pendiente" && estado !== "hecho") {
      return reply.code(400).send({ error: "estado debe ser pendiente, hecho o null" });
    }
    let fecha: Date | null = null;
    if (req.body.fecha) {
      fecha = new Date(req.body.fecha);
      if (Number.isNaN(fecha.getTime())) return reply.code(400).send({ error: "La fecha no es válida" });
    }
    if (estado === "pendiente" && !fecha) return reply.code(400).send({ error: "Elige cuándo volver a contactarlo" });
    const nota = typeof req.body.nota === "string" ? req.body.nota.trim().slice(0, 2000) || null : null;

    // El cliente debe ser de la empresa y, si se pide, visible para ese vendedor.
    const valores: unknown[] = [id, empresaId];
    let visible = "";
    if (visiblePara) {
      valores.push(visiblePara);
      visible = ` AND ${SQL_VISIBLE_PARA(3)}`;
    }
    const existe = await pool.query(`SELECT c.id FROM contactos c WHERE c.id = $1 AND c.empresa_id = $2${visible}`, valores);
    if (existe.rows.length === 0) return reply.code(404).send({ error: "no encontrado" });

    // "hecho" conserva la fecha y nota como historial; sin estado se borra el seguimiento.
    await pool.query(
      `UPDATE contactos SET seguimiento_estado = $2,
              seguimiento_origen = CASE WHEN $2::text = 'pendiente' THEN 'vendedor' WHEN $2::text IS NULL THEN NULL ELSE seguimiento_origen END,
              seguimiento_fecha = CASE WHEN $2::text IS NULL THEN NULL ELSE COALESCE($3::timestamptz, seguimiento_fecha) END,
              seguimiento_nota = CASE WHEN $2::text IS NULL THEN NULL ELSE COALESCE($4, seguimiento_nota) END,
              actualizado_en = now()
       WHERE id = $1`,
      [id, estado ?? null, fecha, nota]
    );
    return { ok: true };
  });
}
