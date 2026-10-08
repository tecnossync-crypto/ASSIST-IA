import { pool } from "../db/pool.js";
import { iniciarLlamadaIA } from "./llamadas-ia.js";
import { normalizarNumero } from "./telefono.js";

export type Disparador = "llamada_completada" | "llamada_no_contesta" | "llamada_transferida";

export interface FlujoTrabajo {
  id: string;
  accion: "agregar_etiqueta" | "crear_solicitud";
  accion_datos: { etiqueta?: string; tipo?: string; descripcion?: string; retraso_minutos?: number | string };
}

const MAX_RETRASO_MINUTOS = 60 * 24 * 30; // 30 días

/** Minutos de espera configurados en la regla (0 = ejecutar al instante). */
export function retrasoMinutos(accionDatos: { retraso_minutos?: number | string } | null | undefined): number {
  const n = Number(accionDatos?.retraso_minutos ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_RETRASO_MINUTOS);
}

/** Ejecuta la acción de un flujo de "al terminar una llamada…" (ahora, o desde la cola de pendientes). */
export async function ejecutarAccionPostLlamada(
  flujo: FlujoTrabajo,
  ctx: { empresaId: string; numeroCliente: string; llamadaId: string | null; disparador: string }
): Promise<void> {
  const { empresaId, numeroCliente, llamadaId, disparador } = ctx;
  if (flujo.accion === "agregar_etiqueta" && flujo.accion_datos.etiqueta) {
    await pool.query(
      `INSERT INTO contactos (empresa_id, numero, etiquetas)
       VALUES ($1, $2, ARRAY[$3::text])
       ON CONFLICT (empresa_id, numero)
       DO UPDATE SET
         etiquetas = ARRAY(SELECT DISTINCT unnest(contactos.etiquetas || ARRAY[$3::text])),
         actualizado_en = now()`,
      [empresaId, normalizarNumero(numeroCliente), flujo.accion_datos.etiqueta]
    );
  } else if (flujo.accion === "crear_solicitud") {
    await pool.query(
      `INSERT INTO solicitudes (empresa_id, llamada_id, tipo, descripcion)
       VALUES ($1, $2, $3, $4)`,
      [
        empresaId,
        llamadaId,
        flujo.accion_datos.tipo ?? "seguimiento",
        flujo.accion_datos.descripcion ?? `Generado automáticamente por flujo de trabajo (${disparador}).`,
      ]
    );
  }
}

/**
 * Evalúa los flujos de trabajo activos de una empresa para el disparador
 * dado y ejecuta sus acciones. Se llama desde el webhook de call-status,
 * una vez que se conoce el resultado final de la llamada. Si la regla tiene
 * un tiempo de espera (retraso_minutos), la acción queda en flujos_pendientes
 * y la ejecuta el despachador cuando llegue la hora.
 */
export async function ejecutarFlujosTrabajo(opts: {
  empresaId: string;
  disparador: Disparador;
  numeroCliente: string;
  llamadaId: string;
}) {
  const { empresaId, disparador, numeroCliente, llamadaId } = opts;

  const flujos = await pool.query<FlujoTrabajo>(
    `SELECT id, accion, accion_datos FROM flujos_trabajo
     WHERE empresa_id = $1 AND disparador = $2 AND activo = true`,
    [empresaId, disparador]
  );

  for (const flujo of flujos.rows) {
    try {
      const espera = retrasoMinutos(flujo.accion_datos);
      if (espera > 0) {
        await pool.query(
          `INSERT INTO flujos_pendientes (empresa_id, flujo_id, llamada_id, numero, disparador, ejecutar_en)
           VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval)`,
          [empresaId, flujo.id, llamadaId, numeroCliente, disparador, String(espera)]
        );
      } else {
        await ejecutarAccionPostLlamada(flujo, { empresaId, numeroCliente, llamadaId, disparador });
      }
    } catch (err) {
      console.error(`[flujo ${flujo.id}] error ejecutando acción:`, err);
    }
  }
}

interface FlujoEtiqueta {
  id: string;
  disparador_datos: { etiqueta?: string };
  accion: string;
  accion_datos: { modo?: "inmediato" | "programada"; fecha?: string; retraso_minutos?: number | string };
}

/**
 * Evalúa los flujos "se agrega una etiqueta a un contacto" — se llama desde
 * PUT /api/contactos/:id/etiquetas con SOLO las etiquetas que se acaban de
 * agregar en esta actualización (no las que el contacto ya tenía, para no
 * volver a disparar la regla cada vez que se guarda sin cambios reales).
 */
export async function ejecutarFlujosPorEtiquetasNuevas(opts: {
  empresaId: string;
  contactoId: string;
  numero: string;
  etiquetasNuevas: string[];
}): Promise<void> {
  const { empresaId, contactoId, numero, etiquetasNuevas } = opts;
  if (etiquetasNuevas.length === 0) return;

  const flujos = await pool.query<FlujoEtiqueta>(
    `SELECT id, disparador_datos, accion, accion_datos FROM flujos_trabajo
     WHERE empresa_id = $1 AND disparador = 'etiqueta_agregada' AND activo = true`,
    [empresaId]
  );

  for (const flujo of flujos.rows) {
    const etiquetaObjetivo = flujo.disparador_datos?.etiqueta;
    if (!etiquetaObjetivo || !etiquetasNuevas.includes(etiquetaObjetivo)) continue;
    if (flujo.accion !== "llamar_contacto") continue;

    try {
      const espera = retrasoMinutos(flujo.accion_datos);
      if (flujo.accion_datos.modo === "programada" && flujo.accion_datos.fecha) {
        await pool.query(
          `INSERT INTO llamadas_programadas (empresa_id, flujo_id, contacto_id, numero, fecha_programada)
           VALUES ($1, $2, $3, $4, $5)`,
          [empresaId, flujo.id, contactoId, numero, flujo.accion_datos.fecha]
        );
      } else if (espera > 0) {
        await pool.query(
          `INSERT INTO llamadas_programadas (empresa_id, flujo_id, contacto_id, numero, fecha_programada)
           VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)`,
          [empresaId, flujo.id, contactoId, numero, String(espera)]
        );
      } else {
        await iniciarLlamadaIA({ empresaId, numero, origen: `flujo:${flujo.id}` });
      }
    } catch (err) {
      console.error(`[flujo ${flujo.id}] error ejecutando llamar_contacto:`, err);
    }
  }
}
