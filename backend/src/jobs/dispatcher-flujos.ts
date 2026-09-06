import { pool } from "../db/pool.js";
import { iniciarLlamadaIA } from "../lib/llamadas-ia.js";

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
