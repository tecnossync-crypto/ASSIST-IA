import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { urlFirmadaGrabacion } from "../lib/storage.js";
import { construirExcel } from "../lib/reporte-excel.js";

/**
 * Reporte de llamadas de IA: cómo van las llamadas que atiende o hace el agente de voz — cuántas se contestaron, cuántas
 * cayeron en buzón o no existen, cuántas se transfirieron a un asesor, duración, satisfacción, motivos y solicitudes —
 * organizado por TIPO de llamada y con la grabación de cada una:
 *
 *   entrante       → el cliente llamó y contestó la IA
 *   campana        → salió de una campaña
 *   api            → la pidió una plataforma externa por webhook (CRM, SalesIQ…)
 *   flujo          → la lanzó un flujo de trabajo automático
 *   click_to_call  → una llamada de ASESOR pedida desde el CRM (no es de IA: solo aparece si se elige ese tipo)
 *
 * Las llamadas que un asesor marca a mano desde el panel no entran.
 */

const ZONA_POR_DEFECTO = process.env.REPORTES_TZ ?? "America/Santo_Domingo";
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const TIPOS_REPORTE = ["entrante", "campana", "api", "flujo", "click_to_call"] as const;
type TipoReporte = (typeof TIPOS_REPORTE)[number];

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

export interface Filtros {
  empresaId: string;
  desde: string;
  hasta: string;
  zona: string;
  campanaId: string | null;
  tipo: TipoReporte | null;
}

export type Consulta = { empresaId?: string; desde?: string; hasta?: string; tz?: string; campanaId?: string; tipo?: string };

export function leerFiltros(q: Consulta): Filtros | string {
  if (!q.empresaId) return "empresaId es requerido";
  const zona = zonaValida(q.tz);
  const hasta = q.hasta && FECHA.test(q.hasta) ? q.hasta : hoyEn(zona);
  const desde = q.desde && FECHA.test(q.desde) ? q.desde : restarDias(hasta, 6);
  if (desde > hasta) return "La fecha de inicio no puede ser posterior a la final";
  if (new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime() > 366 * 86_400_000) {
    return "El periodo no puede pasar de un año";
  }
  const tipo = (TIPOS_REPORTE as readonly string[]).includes(q.tipo ?? "") ? (q.tipo as TipoReporte) : null;
  return { empresaId: q.empresaId, desde, hasta, zona, campanaId: q.campanaId || null, tipo };
}

/**
 * CTE `todas` = llamadas candidatas del periodo con su tipo, resultado y grabación (zona horaria de la empresa, no la
 * del servidor); CTE `base` = las del tipo pedido. Sin tipo: todas las de IA (sin click-to-call). `conTipo=false`
 * deja pasar todos los tipos (para el desglose por tipo).
 */
function baseSQL(f: Filtros, conTipo: boolean): { sql: string; params: unknown[] } {
  const params: unknown[] = [f.empresaId, f.desde, f.hasta, f.zona];
  let filtroCampana = "";
  if (f.campanaId) {
    params.push(f.campanaId);
    filtroCampana = `AND cam.id = $${params.length}`;
  }
  let filtroTipo = "";
  if (!conTipo) filtroTipo = "";
  else if (f.tipo) {
    params.push(f.tipo);
    filtroTipo = `WHERE tipo = $${params.length}`;
  } else filtroTipo = "WHERE tipo <> 'click_to_call'";

  const sql = `
    WITH todas AS (
      SELECT l.id, l.estado, l.direccion, l.numero_origen, l.numero_destino, l.transferida, l.duracion_segundos,
             l.iniciada_en, l.resultado_automatico, l.agente_usuario_id,
             t.satisfaccion, t.resumen_motivo, t.resumen_resultado, (t.id IS NOT NULL) AS hubo_conversacion,
             cam.id AS campana_id, cam.nombre AS campana_nombre,
             w.origen AS origen_api, w.departamento_recibido, rg.nombre AS regla_nombre, col.nombre AS cola_nombre,
             l.origen_externo,
             g.url_storage AS grabacion_path, g.duracion_segundos AS grabacion_segundos,
             CASE
               WHEN l.campana_contacto_id IS NOT NULL THEN 'campana'
               WHEN w.id IS NOT NULL AND w.origen LIKE 'flujo:%' THEN 'flujo'
               WHEN w.id IS NOT NULL THEN 'api'
               WHEN l.origen_externo IS NOT NULL THEN 'click_to_call'
               WHEN l.direccion = 'entrante' THEN 'entrante'
               ELSE 'otro'
             END AS tipo
      FROM llamadas l
      LEFT JOIN LATERAL (
        SELECT tt.id, tt.satisfaccion, tt.resumen_motivo, tt.resumen_resultado
        FROM transcripciones tt WHERE tt.llamada_id = l.id ORDER BY tt.creado_en DESC LIMIT 1
      ) t ON true
      LEFT JOIN LATERAL (
        SELECT ww.id, ww.origen, ww.regla_aplicada_id, ww.departamento_recibido
        FROM llamadas_webhook ww WHERE ww.call_sid = l.call_sid ORDER BY ww.creado_en DESC LIMIT 1
      ) w ON true
      LEFT JOIN reglas_api_llamadas rg ON rg.id = w.regla_aplicada_id
      LEFT JOIN colas col ON col.id = l.cola_id
      LEFT JOIN LATERAL (
        SELECT gg.url_storage, gg.duracion_segundos FROM grabaciones gg WHERE gg.llamada_id = l.id ORDER BY gg.creado_en DESC LIMIT 1
      ) g ON true
      LEFT JOIN campana_contactos cc ON cc.id = l.campana_contacto_id
      LEFT JOIN campanas cam ON cam.id = cc.campana_id
      WHERE l.empresa_id = $1
        AND l.iniciada_en >= ($2::date::timestamp AT TIME ZONE $4)
        AND l.iniciada_en <  (($3::date + 1)::timestamp AT TIME ZONE $4)
        ${filtroCampana}
        AND (
          t.id IS NOT NULL OR l.campana_contacto_id IS NOT NULL OR l.resultado_automatico IS NOT NULL
          OR l.direccion = 'entrante' OR w.id IS NOT NULL OR l.origen_externo IS NOT NULL
        )
    ),
    base AS (SELECT * FROM todas ${filtroTipo})`;
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

const TIPO_TEXTO = `
  CASE tipo
    WHEN 'entrante' THEN 'Entrante'
    WHEN 'campana' THEN 'Campaña'
    WHEN 'api' THEN 'API'
    WHEN 'flujo' THEN 'Flujo automático'
    WHEN 'click_to_call' THEN 'Click-to-call (asesor)'
    ELSE 'Otra'
  END`;

/** Todas las cifras del reporte del periodo (lo usan la pantalla y el Excel). */
export async function calcularReporte(f: Filtros) {
    const { sql, params } = baseSQL(f, true);
    const todos = baseSQL(f, false);

    const [resumen, porDia, porCampana, motivos, solicitudes, porTipo, porRegla, porDepartamento] = await Promise.all([
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
           COUNT(*) FILTER (WHERE grabacion_path IS NOT NULL)::int AS con_grabacion,
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
      // Desglose por tipo: ignora el tipo elegido para poder mostrar todas las pestañas con su conteo.
      pool.query(
        `${todos.sql}
         SELECT tipo,
                COUNT(*)::int AS llamadas,
                COUNT(*) FILTER (WHERE ${CON_CONVERSACION})::int AS con_conversacion,
                COUNT(*) FILTER (WHERE ${NO_CONTESTO})::int AS no_contestadas,
                COUNT(*) FILTER (WHERE transferida)::int AS transferidas,
                COUNT(*) FILTER (WHERE grabacion_path IS NOT NULL)::int AS con_grabacion
         FROM base GROUP BY tipo`,
        todos.params
      ),
      // Llamadas por API: qué regla de Configuración → Integraciones se aplicó. "Sin regla" = la solicitud no traía el
      // campo (etiqueta) que alguna regla espera, y se usó el guion general de la empresa.
      pool.query(
        `${sql}
         SELECT COALESCE(regla_nombre, 'Sin regla (guion general)') AS regla, COUNT(*)::int AS llamadas,
                COUNT(*) FILTER (WHERE transferida)::int AS transferidas
         FROM base WHERE tipo = 'api'
         GROUP BY 1 ORDER BY llamadas DESC`,
        params
      ),
      // Departamento al que quedó cada llamada (el que fijó la API o el que eligió la IA al transferir / registrar).
      pool.query(
        `${sql}
         SELECT COALESCE(cola_nombre, 'Sin departamento') AS departamento, COUNT(*)::int AS llamadas,
                COUNT(*) FILTER (WHERE transferida)::int AS transferidas
         FROM base WHERE cola_nombre IS NOT NULL OR transferida
         GROUP BY 1 ORDER BY llamadas DESC`,
        params
      ),
    ]);

    return {
      periodo: { desde: f.desde, hasta: f.hasta, zona: f.zona, campanaId: f.campanaId, tipo: f.tipo },
      resumen: resumen.rows[0],
      por_dia: porDia.rows,
      por_campana: porCampana.rows,
      motivos: motivos.rows,
      solicitudes: solicitudes.rows,
      por_tipo: porTipo.rows,
      por_regla: porRegla.rows,
      por_departamento: porDepartamento.rows,
    };
}

/** Detalle llamada por llamada (hasta 50 000) para el CSV y el Excel. */
export async function filasParaExportar(f: Filtros): Promise<Record<string, string | number>[]> {
  const { sql, params } = baseSQL(f, true);
  const r = await pool.query(
      `${sql}
       SELECT to_char(iniciada_en AT TIME ZONE $4, 'YYYY-MM-DD HH24:MI:SS') AS fecha,
              CASE WHEN direccion = 'entrante' THEN 'Entrante' ELSE 'Saliente' END AS direccion,
              ${TIPO_TEXTO} AS tipo,
              COALESCE(campana_nombre, origen_api, origen_externo, '') AS detalle,
              CASE WHEN direccion = 'entrante' THEN numero_origen ELSE numero_destino END AS numero_cliente,
              ${RESULTADO_TEXTO} AS resultado,
              COALESCE(cola_nombre, '') AS departamento,
              CASE WHEN tipo = 'api' THEN COALESCE(regla_nombre, 'Sin regla') ELSE '' END AS regla,
              CASE WHEN transferida THEN 'Sí' ELSE 'No' END AS transferida,
              COALESCE(duracion_segundos, 0) AS duracion_segundos,
              CASE WHEN grabacion_path IS NOT NULL THEN 'Sí' ELSE 'No' END AS grabacion,
              COALESCE((SELECT u.nombre FROM usuarios u WHERE u.id = agente_usuario_id), '') AS asesor,
              COALESCE(satisfaccion, '') AS satisfaccion,
              COALESCE(resumen_motivo, '') AS motivo,
              COALESCE(resumen_resultado, '') AS resultado_conversacion
       FROM base ORDER BY iniciada_en LIMIT 50000`,
      params
    );
  return r.rows;
}

export async function reportesRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Consulta }>("/api/reportes/ia", async (req, reply) => {
    const f = leerFiltros(req.query);
    if (typeof f === "string") {
      reply.code(400).send({ error: f });
      return;
    }
    reply.send(await calcularReporte(f));
  });

  // Detalle llamada por llamada del periodo (con reproductor de la grabación), paginado.
  app.get<{ Querystring: Consulta & { limite?: string; pagina?: string } }>("/api/reportes/ia/llamadas", async (req, reply) => {
    const f = leerFiltros(req.query);
    if (typeof f === "string") {
      reply.code(400).send({ error: f });
      return;
    }
    const limite = Math.min(Math.max(parseInt(req.query.limite ?? "25", 10) || 25, 1), 100);
    const pagina = Math.max(parseInt(req.query.pagina ?? "1", 10) || 1, 1);
    const { sql, params } = baseSQL(f, true);
    params.push(limite, (pagina - 1) * limite);

    const r = await pool.query(
      `${sql}
       SELECT id,
              to_char(iniciada_en AT TIME ZONE $4, 'YYYY-MM-DD HH24:MI') AS fecha,
              direccion,
              CASE WHEN direccion = 'entrante' THEN numero_origen ELSE numero_destino END AS numero_cliente,
              tipo,
              ${TIPO_TEXTO} AS tipo_texto,
              COALESCE(campana_nombre, origen_api, origen_externo, '') AS detalle,
              ${RESULTADO_TEXTO} AS resultado,
              COALESCE(cola_nombre, '') AS departamento,
              CASE WHEN tipo = 'api' THEN COALESCE(regla_nombre, 'Sin regla') ELSE '' END AS regla,
              COALESCE(departamento_recibido, '') AS departamento_recibido,
              transferida,
              COALESCE(duracion_segundos, 0) AS duracion_segundos,
              COALESCE((SELECT u.nombre FROM usuarios u WHERE u.id = agente_usuario_id), '') AS asesor,
              COALESCE(satisfaccion, '') AS satisfaccion,
              COALESCE(resumen_motivo, '') AS motivo,
              grabacion_path,
              (grabacion_path IS NULL AND estado <> 'en_curso' AND COALESCE(duracion_segundos, 0) >= 10) AS falta_grabacion,
              COUNT(*) OVER()::int AS total_filas
       FROM base ORDER BY iniciada_en DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Enlaces temporales a las grabaciones (1 hora: la pantalla puede quedarse abierta un rato).
    const llamadas = await Promise.all(
      r.rows.map(async (fila) => {
        let grabacionUrl: string | null = null;
        if (fila.grabacion_path) {
          grabacionUrl = await urlFirmadaGrabacion(fila.grabacion_path, 3600).catch((err) => {
            app.log.error({ err, llamadaId: fila.id }, "No se pudo firmar la grabación del reporte");
            return null;
          });
        }
        const { grabacion_path: _omitida, total_filas: _total, ...resto } = fila;
        return { ...resto, grabacion_url: grabacionUrl, tiene_grabacion: Boolean(fila.grabacion_path) };
      })
    );

    reply.send({
      llamadas,
      total: r.rows[0]?.total_filas ?? 0,
      pagina,
      limite,
    });
  });

  // Excel profesional (resumen, estadísticas por día / tipo / campaña / API, gráficos y detalle con filtros).
  app.get<{ Querystring: Consulta }>("/api/reportes/ia/excel", async (req, reply) => {
    const f = leerFiltros(req.query);
    if (typeof f === "string") {
      reply.code(400).send({ error: f });
      return;
    }
    const [datos, filas, empresa, campana] = await Promise.all([
      calcularReporte(f),
      filasParaExportar(f),
      pool.query<{ nombre: string }>("SELECT nombre FROM empresas WHERE id = $1", [f.empresaId]),
      f.campanaId
        ? pool.query<{ nombre: string }>("SELECT nombre FROM campanas WHERE id = $1 AND empresa_id = $2", [f.campanaId, f.empresaId])
        : Promise.resolve({ rows: [] as { nombre: string }[] }),
    ]);

    const etiquetasTipo: Record<string, string> = {
      entrante: "Entrantes",
      campana: "Campañas",
      api: "API",
      flujo: "Flujos automáticos",
      click_to_call: "Click-to-call (asesor)",
    };
    const buffer = await construirExcel({
      empresa: empresa.rows[0]?.nombre ?? "",
      zona: f.zona,
      generado: new Date().toLocaleString("es", { timeZone: f.zona }),
      periodo: { desde: f.desde, hasta: f.hasta },
      tipoEtiqueta: f.tipo ? etiquetasTipo[f.tipo] : "Todas las llamadas de IA",
      campanaNombre: campana.rows[0]?.nombre ?? null,
      resumen: datos.resumen,
      porDia: datos.por_dia,
      porTipo: datos.por_tipo,
      porCampana: datos.por_campana,
      porRegla: datos.por_regla,
      porDepartamento: datos.por_departamento,
      motivos: datos.motivos,
      solicitudes: datos.solicitudes,
      filas,
    });

    reply
      .header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("content-disposition", `attachment; filename="reporte-llamadas-ia_${f.desde}_a_${f.hasta}.xlsx"`)
      .send(buffer);
  });

  // CSV con el detalle del mismo periodo (se abre directo en Excel).
  app.get<{ Querystring: Consulta }>("/api/reportes/ia/exportar", async (req, reply) => {
    const f = leerFiltros(req.query);
    if (typeof f === "string") {
      reply.code(400).send({ error: f });
      return;
    }
    const filas = await filasParaExportar(f);

    const columnas = [
      ["fecha", "Fecha"],
      ["direccion", "Dirección"],
      ["tipo", "Tipo de llamada"],
      ["detalle", "Campaña / origen"],
      ["numero_cliente", "Número del cliente"],
      ["resultado", "Resultado"],
      ["departamento", "Departamento"],
      ["regla", "Regla de API aplicada"],
      ["transferida", "Transferida a asesor"],
      ["duracion_segundos", "Duración (s)"],
      ["grabacion", "Tiene grabación"],
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
    for (const fila of filas) {
      lineas.push(columnas.map(([k]) => (k === "numero_cliente" ? telefono(fila[k]) : celda(fila[k]))).join(","));
    }

    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="reporte-llamadas-ia_${f.desde}_a_${f.hasta}.csv"`)
      .send("﻿" + lineas.join("\r\n")); // BOM para que Excel lea bien los acentos
  });
}
