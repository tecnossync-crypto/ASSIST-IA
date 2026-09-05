import { pool } from "../db/pool.js";
import { eliminarGrabacion } from "../lib/storage.js";

/**
 * Borra del storage las grabaciones más viejas que la retención configurada
 * por cada empresa (por defecto 30 días) — solo el audio y su fila en
 * `grabaciones`; la llamada y su transcripción/resumen se quedan para
 * siempre, así no se pierde el historial, solo el archivo pesado.
 */
export async function limpiarGrabacionesVencidas(): Promise<{ borradas: number }> {
  const vencidas = await pool.query<{ id: string; url_storage: string }>(
    `SELECT g.id, g.url_storage
     FROM grabaciones g
     JOIN empresas e ON e.id = g.empresa_id
     WHERE g.creado_en < now() - (e.retencion_grabaciones_dias || ' days')::interval`
  );

  let borradas = 0;
  for (const g of vencidas.rows) {
    try {
      await eliminarGrabacion(g.url_storage);
    } catch (err) {
      console.error(`No se pudo borrar del storage la grabación ${g.id}:`, err);
      // Igual se borra la fila: si el archivo ya no existe en storage, no
      // tiene sentido seguir reintentando esta fila cada tick.
    }
    await pool.query("DELETE FROM grabaciones WHERE id = $1", [g.id]);
    borradas++;
  }

  return { borradas };
}
