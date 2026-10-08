import { pool } from "../db/pool.js";
import { iniciarLlamadaIA } from "../lib/llamadas-ia.js";
import { ejecutarAccionPostLlamada } from "../lib/flujos-trabajo.js";

// Cuántas llamadas programadas se originan por tick — mismo espíritu que el
// despachador de campañas, para no disparar de golpe si muchas cayeron a la
// misma fecha/hora.
const LOTE_POR_TICK = Number(process.env.FLUJOS_LOTE_POR_TICK ?? 5);

/**
 * Un ciclo del despachador de flujos: toma llamadas_programadas pendientes
 * cuya fecha_programada ya llegó (las que creó un flujo "se agrega una
 * etiqueta" con modo "programada") y las origina con IA. Corre en el mismo
 * proceso del backend, igual que el despachador de campañas.
 */
export async function procesarTickLlamadasProgramadas(): Promise<void> {
  const pendientes = await pool.query<{ id: string; empresa_id: string; numero: string }>(
    `SELECT id, empresa_id, numero FROM llamadas_programadas
     WHERE estado = 'pendiente' AND fecha_programada <= now()
     ORDER BY fecha_programada
     LIMIT $1`,
    [LOTE_POR_TICK]
  );

  for (const fila of pendientes.rows) {
    try {
      const { callSid } = await iniciarLlamadaIA({
        empresaId: fila.empresa_id,
        numero: fila.numero,
        origen: "flujo_programado",
      });
      await pool.query(`UPDATE llamadas_programadas SET estado = 'completada', call_sid = $2 WHERE id = $1`, [
        fila.id,
        callSid,
      ]);
    } catch (err) {
      console.error(`[llamadas_programadas ${fila.id}] error originando llamada:`, err);
      await pool.query(`UPDATE llamadas_programadas SET estado = 'fallida', error = $2 WHERE id = $1`, [
        fila.id,
        String(err),
      ]);
    }
  }
}

/**
 * Ejecuta las acciones de flujos "al terminar una llamada…" que tenían un
 * tiempo de espera (flujos_pendientes) y cuya hora ya llegó. Se marcan como
 * tomadas ANTES de ejecutar, para que dos ticks seguidos nunca ejecuten la
 * misma fila dos veces.
 */
export async function procesarTickFlujosPendientes(): Promise<void> {
  const pendientes = await pool.query<{
    id: string;
    empresa_id: string;
    llamada_id: string | null;
    numero: string;
    disparador: string;
    accion: "agregar_etiqueta" | "crear_solicitud";
    accion_datos: { etiqueta?: string; tipo?: string; descripcion?: string };
    activo: boolean;
  }>(
    `UPDATE flujos_pendientes p SET estado = 'completada'
     FROM flujos_trabajo f
     WHERE p.id IN (
             SELECT id FROM flujos_pendientes
             WHERE estado = 'pendiente' AND ejecutar_en <= now()
             ORDER BY ejecutar_en LIMIT $1
             FOR UPDATE SKIP LOCKED
           )
       AND f.id = p.flujo_id
     RETURNING p.id, p.empresa_id, p.llamada_id, p.numero, p.disparador, f.accion, f.accion_datos, f.activo`,
    [LOTE_POR_TICK]
  );

  for (const fila of pendientes.rows) {
    // Si la regla se apagó mientras esperaba, no se ejecuta.
    if (!fila.activo) continue;
    try {
      await ejecutarAccionPostLlamada(
        { id: fila.id, accion: fila.accion, accion_datos: fila.accion_datos },
        { empresaId: fila.empresa_id, numeroCliente: fila.numero, llamadaId: fila.llamada_id, disparador: fila.disparador }
      );
    } catch (err) {
      console.error(`[flujos_pendientes ${fila.id}] error ejecutando acción:`, err);
      await pool.query("UPDATE flujos_pendientes SET estado = 'fallida', error = $2 WHERE id = $1", [fila.id, String(err)]);
    }
  }
}
