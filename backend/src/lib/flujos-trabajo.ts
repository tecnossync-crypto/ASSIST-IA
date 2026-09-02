import { pool } from "../db/pool.js";

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
