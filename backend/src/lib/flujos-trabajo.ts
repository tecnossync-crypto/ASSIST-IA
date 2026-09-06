import { pool } from "../db/pool.js";
import { iniciarLlamadaIA } from "./llamadas-ia.js";

export type Disparador = "llamada_completada" | "llamada_no_contesta" | "llamada_transferida";

interface FlujoTrabajo {
  id: string;
  accion: "agregar_etiqueta" | "crear_solicitud";
  accion_datos: { etiqueta?: string; tipo?: string; descripcion?: string };
}

/**
 * Evalúa los flujos de trabajo activos de una empresa para el disparador
 * dado y ejecuta sus acciones. Se llama desde el webhook de call-status,
 * una vez que se conoce el resultado final de la llamada.
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
      if (flujo.accion === "agregar_etiqueta" && flujo.accion_datos.etiqueta) {
        await pool.query(
          `INSERT INTO contactos (empresa_id, numero, etiquetas)
           VALUES ($1, $2, ARRAY[$3::text])
           ON CONFLICT (empresa_id, numero)
           DO UPDATE SET
             etiquetas = ARRAY(SELECT DISTINCT unnest(contactos.etiquetas || ARRAY[$3::text])),
             actualizado_en = now()`,
          [empresaId, numeroCliente, flujo.accion_datos.etiqueta]
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
    } catch (err) {
      console.error(`[flujo ${flujo.id}] error ejecutando acción:`, err);
    }
  }
}

interface FlujoEtiqueta {
  id: string;
  disparador_datos: { etiqueta?: string };
  accion: string;
  accion_datos: { modo?: "inmediato" | "programada"; fecha?: string };
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
      if (flujo.accion_datos.modo === "programada" && flujo.accion_datos.fecha) {
        await pool.query(
          `INSERT INTO llamadas_programadas (empresa_id, flujo_id, contacto_id, numero, fecha_programada)
           VALUES ($1, $2, $3, $4, $5)`,
          [empresaId, flujo.id, contactoId, numero, flujo.accion_datos.fecha]
        );
      } else {
        await iniciarLlamadaIA({ empresaId, numero, origen: `flujo:${flujo.id}` });
      }
    } catch (err) {
      console.error(`[flujo ${flujo.id}] error ejecutando llamar_contacto:`, err);
    }
  }
}
