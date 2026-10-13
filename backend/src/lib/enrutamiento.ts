import { pool } from "../db/pool.js";
import { modoOperadorOrigenActivo } from "./agentes.js";

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
 * Modo "Al operador que originó la llamada" hacia la central: la extensión activa
 * (teléfono físico) de ESE vendedor, si el reparto de la cola/empresa es ese modo y
 * el vendedor tiene una extensión asignada. Si no, null y suena el departamento.
 * (Los teléfonos físicos no reportan presencia: se marca su extensión directamente.)
 */
export async function extensionDelOperador(
  empresaId: string,
  colaId: string | null,
  operadorUsuarioId: string | null | undefined
): Promise<string | null> {
  if (!operadorUsuarioId) return null;
  if (!(await modoOperadorOrigenActivo(empresaId, colaId))) return null;
  const r = await pool.query<{ numero: string }>(
    "SELECT numero FROM extensiones_central WHERE empresa_id = $1 AND usuario_id = $2 AND activa = true ORDER BY numero LIMIT 1",
    [empresaId, operadorUsuarioId]
  );
  return r.rows[0]?.numero ?? null;
}

/**
 * Extensiones de la central que deben sonar:
 * 1. Las activas de la cola de la llamada.
 * 2. Si la cola no tiene ninguna (o no hay cola): las activas "generales"
 *    (sin departamento).
 * 3. Si ni así hay, y la llamada NO tiene departamento (la IA no eligió uno):
 *    todas las activas de la central, para no perder la llamada. Si la llamada
 *    sí tiene departamento pero este no tiene extensiones, NO se marca a los
 *    de otros departamentos.
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
  if (generales.rows.length > 0 || colaId) return generales.rows.map((r) => r.numero);

  const todas = await pool.query<{ numero: string }>(
    "SELECT numero FROM extensiones_central WHERE empresa_id = $1 AND activa = true ORDER BY numero",
    [empresaId]
  );
  return todas.rows.map((r) => r.numero);
}
