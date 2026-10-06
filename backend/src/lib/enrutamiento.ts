import { pool } from "../db/pool.js";

export type DestinoLlamadas = "plataforma" | "central" | "ambos";

/**
 * Dónde se atiende una llamada transferida por la IA: el destino propio de
 * la cola si lo tiene, si no el de la empresa ("plataforma" por defecto —
 * el comportamiento de siempre).
 */
export async function destinoDeTransferencia(empresaId: string, colaId: string | null): Promise<DestinoLlamadas> {
  const r = await pool.query<{ destino: DestinoLlamadas | null }>(
    `SELECT COALESCE(
              (SELECT destino_llamadas FROM colas WHERE id = $2 AND empresa_id = $1),
              (SELECT enrutamiento_destino FROM empresas WHERE id = $1)
            ) AS destino`,
    [empresaId, colaId]
  );
  return r.rows[0]?.destino ?? "plataforma";
}

/**
 * Extensiones de la central que deben sonar: las activas de la cola; si la
 * cola no tiene ninguna (o la llamada no tiene cola), las activas "generales"
 * (sin departamento).
 */
export async function extensionesDeTransferencia(empresaId: string, colaId: string | null): Promise<string[]> {
  if (colaId) {
    const deCola = await pool.query<{ numero: string }>(
      "SELECT numero FROM extensiones_central WHERE empresa_id = $1 AND cola_id = $2 AND activa = true ORDER BY numero",
      [empresaId, colaId]
    );
    if (deCola.rows.length > 0) return deCola.rows.map((r) => r.numero);
  }
  const generales = await pool.query<{ numero: string }>(
    "SELECT numero FROM extensiones_central WHERE empresa_id = $1 AND cola_id IS NULL AND activa = true ORDER BY numero",
    [empresaId]
  );
  return generales.rows.map((r) => r.numero);
}
