import { pool } from "../db/pool.js";
import { desencriptar } from "./crypto.js";
import { subirArchivoWorkDrive, ZohoTokenInvalidoError } from "./zoho-workdrive.js";

/**
 * Si la empresa conectó una cuenta de nube (hoy: Zoho WorkDrive), sube una
 * copia de la grabación ahí mismo, además de guardarla en nuestro storage.
 * No bloquea ni falla el procesamiento normal de la llamada si esto falla
 * — es una comodidad extra, no la fuente de verdad (esa sigue siendo S3 +
 * la base de datos).
 */
export async function sincronizarGrabacionANube(opts: {
  empresaId: string;
  nombreArchivo: string;
  contenido: Buffer;
}): Promise<void> {
  const { empresaId, nombreArchivo, contenido } = opts;

  const empresa = await pool.query<{
    zoho_workdrive_refresh_token_enc: string | null;
    zoho_workdrive_carpeta_id: string | null;
  }>(
    "SELECT zoho_workdrive_refresh_token_enc, zoho_workdrive_carpeta_id FROM empresas WHERE id = $1",
    [empresaId]
  );
  const row = empresa.rows[0];
  if (!row?.zoho_workdrive_refresh_token_enc || !row.zoho_workdrive_carpeta_id) return; // no conectado, nada que hacer

  try {
    await subirArchivoWorkDrive({
      refreshToken: desencriptar(row.zoho_workdrive_refresh_token_enc),
      carpetaId: row.zoho_workdrive_carpeta_id,
      nombreArchivo,
      contenido,
    });
  } catch (err) {
    if (err instanceof ZohoTokenInvalidoError) {
      // El cliente revocó el acceso (o Zoho invalidó el token) — borrar la
      // conexión guardada para que el dashboard muestre "Conectar" de
      // nuevo, en vez de seguir fallando en silencio en cada grabación.
      await pool.query(
        `UPDATE empresas SET zoho_workdrive_refresh_token_enc = NULL, zoho_workdrive_api_domain = NULL WHERE id = $1`,
        [empresaId]
      );
    }
    throw err;
  }
}
