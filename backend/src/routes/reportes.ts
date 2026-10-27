import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * Reporte de llamadas de IA: cómo van las llamadas que atiende o hace el agente de voz (entrantes, campañas, API y
 * flujos) en un periodo — cuántas se contestaron, cuántas cayeron en buzón o no existen, cuántas se transfirieron a un
 * asesor, duración, satisfacción, motivos más frecuentes y solicitudes registradas. Se puede exportar a CSV.
 *
 * "Llamada de IA" = toda llamada entrante (la contesta la IA primero), o saliente que salió de una campaña, de un
 * webhook / flujo, o que tiene transcripción. Quedan fuera las llamadas que un asesor marca a mano desde el panel.
 */

const ZONA_POR_DEFECTO = process.env.REPORTES_TZ ?? "America/Santo_Domingo";
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function zonaValida(z: string | undefined): string {
  if (!z) return ZONA_POR_DEFECTO;
  try {
    new Intl.DateTimeFormat("es", { timeZone: z });
    return z;
  } catch {
    return ZONA_POR_DEFECTO;
  }
}

function hoyEn(zona: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: zona }); // YYYY-MM-DD
}

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

interface Filtros {
  empresaId: string;
  desde: string;
  hasta: string;
  zona: string;
  campanaId: string | null;
}

function leerFiltros(q: { empresaId?: string; desde?: string; hasta?: string; tz?: string; campanaId?: string }): Filtros | string {
  if (!q.empresaId) return "empresaId es requerido";
  const zona = zonaValida(q.tz);
  const hasta = q.hasta && FECHA.test(q.hasta) ? q.hasta : hoyEn(zona);
  const desde = q.desde && FECHA.test(q.desde) ? q.desde : restarDias(hasta, 6);
  if (desde > hasta) return "La fecha de inicio no puede ser posterior a la final";
  if (new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime() > 366 * 86_400_000) {
    return "El periodo no puede pasar de un año";
  }
  return { empresaId: q.empresaId, desde, hasta, zona, campanaId: q.campanaId || null };
}

/** CTE con las llamadas de IA del periodo (zona horaria de la empresa, no la del servidor). */
function baseSQL(f: Filtros): { sql: string; params: unknown[] } {
  const params: unknown[] = [f.empresaId, f.desde, f.hasta, f.zona];
  let filtroCampana = "";
  if (f.campanaId) {
    params.push(f.campanaId);
    filtroCampana = `AND cam.id = $${params.length}`;
  }
  const sql = `
    WITH base AS (
      SELECT l.id, l.direccion, l.numero_origen, l.numero_destino, l.estado, l.transferida, l.duracion_segundos,
             l.iniciada_en, l.resultado_automatico, l.agente_usuario_id,
             t.satisfaccion, t.resumen_motivo, t.resumen_resultado, (t.id IS NOT NULL) AS hubo_conversacion,
             cam.id AS campana_id, cam.nombre AS campana_nombre
      FROM llamadas l
      LEFT JOIN LATERAL (
        SELECT tt.id, tt.satisfaccion, tt.resumen_motivo, tt.resumen_resultado
        FROM transcripciones tt WHERE tt.llamada_id = l.id ORDER BY tt.creado_en DESC LIMIT 1
      ) t ON true
      LEFT JOIN campana_contactos cc ON cc.id = l.campana_contacto_id
      LEFT JOIN campanas cam ON cam.id = cc.campana_id
      WHERE l.empresa_id = $1
        AND l.iniciada_en >= ($2::date::timestamp AT TIME ZONE $4)
        AND l.iniciada_en <  (($3::date + 1)::timestamp AT TIME ZONE $4)
        ${filtroCampana}
        AND (
          t.id IS NOT NULL OR l.campana_contacto_id IS NOT NULL OR l.resultado_automatico IS NOT NULL
          OR l.direccion = 'entrante'
          OR EXISTS (SELECT 1 FROM llamadas_webhook w WHERE w.call_sid = l.call_sid)
        )
    )`;
  return { sql, params };
}

const NO_CONTESTO = "(estado = 'fallida' OR resultado_automatico IS NOT NULL)";
const CON_CONVERSACION = `(NOT ${NO_CONTESTO} AND hubo_conversacion)`;

const RESULTADO_TEXTO = `
  CASE
    WHEN resultado_automatico = 'buzon' THEN 'Buzón de voz'
    WHEN resultado_automatico = 'numero_inexistente' THEN 'Número inexistente'
    WHEN resultado_automatico = 'sin_contacto' THEN 'Cerrada sin contacto'
    WHEN estado = 'fallida' THEN 'No contestó / falló'
    WHEN transferida THEN 'Transferida a asesor'
    WHEN hubo_conversacion THEN 'Conversación'
    WHEN estado = 'en_curso' THEN 'En curso'
    ELSE 'Sin conversación'
  END`;

export async function reportesRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { empresaId?: string; desde?: string; hasta?: string; tz?: string; campanaId?: string };
  }>("/api/reportes/ia", async (req, reply) => {
    const f = leerFiltros(req.query);
    if (typeof f === "string") {
      reply.code(400).send({ error: f });
      return;
    }
    const { sql, params } = baseSQL(f);

    const [resumen, porDia, porCampana, motivos, solicitudes] = await Promise.all([
      pool.query(
        `${sql}
         SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE direccion = 'entrante')::int AS entrantes,
           COUNT(*) FILTER (WHERE direccion = 'saliente')::int AS salientes,
           COUNT(*) FILTER (WHERE ${NO_CONTESTO})::int AS no_contestadas,
           COUNT(*) FILTER (WHERE resultado_automatico = 'buzon')::int AS buzon,
           COUNT(*) FILTER (WHERE resultado_automatico = 'numero_inexistente')::int AS numero_inexistente,
           COUNT(*) FILTER (WHERE resultado_automatico = 'sin_contacto')::int AS cerradas_sin_contacto,
           COUNT(*) FILTER (WHERE estado = 'fallida' AND resultado_automatico IS NULL)::int AS otras_no_contestadas,
           COUNT(*) FILTER (WHERE ${CON_CONVERSACION})::int AS con_conversacion,
           COUNT(*) FILTER (WHERE transferida)::int AS transferidas,
           COUNT(*) FILTER (WHERE transferida AND agente_usuario_id IS NOT NULL)::int AS atendidas_por_asesor,
           COALESCE(ROUND(AVG(duracion_segundos) FILTER (WHERE ${CON_CONVERSACION})), 0)::int AS duracion_promedio_segundos,
           COALESCE(SUM(duracion_segundos), 0)::int AS segundos_totales,
           COUNT(*) FILTER (WHERE satisfaccion = 'positiva')::int AS sat_positiva,
           COUNT(*) FILTER (WHERE satisfaccion = 'neutral')::int AS sat_neutral,
           COUNT(*) FILTER (WHERE satisfaccion = 'negativa')::int AS sat_negativa
         FROM base`,
        params
      ),
      pool.query(
        `${sql}
         SELECT to_char(date_trunc('day', iniciada_en AT TIME ZONE $4), 'YYYY-MM-DD') AS dia,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE ${CON_CONVERSACION})::int AS con_conversacion,
                COUNT(*) FILTER (WHERE ${NO_CONTESTO})::int AS no_contestadas,
                COUNT(*) FILTER (WHERE transferida)::int AS transferidas
         FROM base GROUP BY 1 ORDER BY 1`,
        params
      ),
      pool.query(
        `${sql}
         SELECT campana_id, campana_nombre,
                COUNT(*)::int AS llamadas,
                COUNT(*) FILTER (WHERE ${CON_CONVERSACION})::int AS con_conversacion,
                COUNT(*) FILTER (WHERE ${NO_CONTESTO})::int AS no_contestadas,
                COUNT(*) FILTER (WHERE resultado_automatico = 'buzon')::int AS buzon,
                COUNT(*) FILTER (WHERE transferida)::int AS transferidas
         FROM base WHERE campana_id IS NOT NULL
         GROUP BY 1, 2 ORDER BY llamadas DESC`,
        params
      ),
      pool.query(
        `${sql}
         SELECT lower(trim(resumen_motivo)) AS motivo, COUNT(*)::int AS n
         FROM base WHERE resumen_motivo IS NOT NULL AND trim(resumen_motivo) <> ''
         GROUP BY 1 ORDER BY n DESC, motivo LIMIT 8`,
        params
      ),
      pool.query(
        `${sql}
         SELECT COALESCE(NULLIF(s.tipo, ''), 'otro') AS tipo, COUNT(*)::int AS n
         FROM solicitudes s JOIN base b ON b.id = s.llamada_id
         GROUP BY 1 ORDER BY n DESC`,
        params
      ),
    ]);

    reply.send({
      periodo: { desde: f.desde, hasta: f.hasta, zona: f.zona, campanaId: f.campanaId },
      resumen: resumen.rows[0],
      por_dia: porDia.rows,
      por_campana: porCampana.rows,
      motivos: motivos.rows,
      solicitudes: solicitudes.rows,
    });
  });

  // CSV con el detalle llamada por llamada del mismo periodo (se abre directo en Excel).
  app.get<{
    Querystring: { empresaId?: string; desde?: string; hasta?: string; tz?: string; campanaId?: string };
  }>("/api/reportes/ia/exportar", async (req, reply) => {
    const f = leerFiltros(req.query);
    if (typeof f === "string") {
      reply.code(400).send({ error: f });
      return;
    }
    const { sql, params } = baseSQL(f);
    const r = await pool.query(
      `${sql}
       SELECT to_char(iniciada_en AT TIME ZONE $4, 'YYYY-MM-DD HH24:MI:SS') AS fecha,
              CASE WHEN direccion = 'entrante' THEN 'Entrante' ELSE 'Saliente' END AS direccion,
              CASE WHEN direccion = 'entrante' THEN numero_origen ELSE numero_destino END AS numero_cliente,
              ${RESULTADO_TEXTO} AS resultado,
              CASE WHEN transferida THEN 'Sí' ELSE 'No' END AS transferida,
              COALESCE(duracion_segundos, 0) AS duracion_segundos,
              COALESCE(campana_nombre, '') AS campana,
              COALESCE((SELECT u.nombre FROM usuarios u WHERE u.id = agente_usuario_id), '') AS asesor,
              COALESCE(satisfaccion, '') AS satisfaccion,
              COALESCE(resumen_motivo, '') AS motivo,
              COALESCE(resumen_resultado, '') AS resultado_conversacion
       FROM base ORDER BY iniciada_en LIMIT 50000`,
      params
    );

    const columnas = [
      ["fecha", "Fecha"],
      ["direccion", "Dirección"],
      ["numero_cliente", "Número del cliente"],
      ["resultado", "Resultado"],
      ["transferida", "Transferida a asesor"],
      ["duracion_segundos", "Duración (s)"],
      ["campana", "Campaña"],
      ["asesor", "Asesor"],
      ["satisfaccion", "Satisfacción"],
      ["motivo", "Motivo"],
      ["resultado_conversacion", "Resultado de la conversación"],
    ] as const;
    const celda = (v: unknown) => {
      const s = String(v ?? "");
      // Texto libre (motivos, nombres…): evita que Excel lo interprete como fórmula.
      const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${seguro.replace(/"/g, '""')}"`;
    };
    // Teléfonos: se escriben como texto (="+1809…") para que Excel no se coma el "+" ni los convierta en número.
    const telefono = (v: unknown) => `"=""${String(v ?? "").replace(/[^\d+]/g, "")}"""`;
    const lineas = [columnas.map(([, t]) => celda(t)).join(",")];
    for (const fila of r.rows) {
      lineas.push(columnas.map(([k]) => (k === "numero_cliente" ? telefono(fila[k]) : celda(fila[k]))).join(","));
    }

    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="reporte-llamadas-ia_${f.desde}_a_${f.hasta}.csv"`)
      .send("﻿" + lineas.join("\r\n")); // BOM para que Excel lea bien los acentos
  });
}
