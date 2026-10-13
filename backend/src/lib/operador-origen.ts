import { pool } from "../db/pool.js";

/**
 * Modo de reparto "Al operador que originó la llamada": una plataforma externa
 * (ej. Zoho SalesIQ) pide la llamada de IA y manda en el POST qué operador la
 * disparó (campo `operador`). Si la IA después transfiere a una persona, le
 * suena a ESE operador — si está activo; si no, se reparte como "suena en todos".
 */

/**
 * Identifica a un asesor de la empresa por lo que mandó la plataforma externa:
 * primero por su "Id externo" (Configuración → Agentes), luego por email y por
 * último por nombre exacto. Solo cuenta si hay UNA coincidencia: ante la duda
 * (dos asesores con el mismo nombre) no se adivina.
 */
export async function resolverOperadorExterno(empresaId: string, valor: unknown): Promise<string | null> {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase();
  if (!v || v.length > 200) return null;

  for (const columna of ["id_externo", "email", "nombre"] as const) {
    const r = await pool.query<{ id: string }>(
      `SELECT id FROM usuarios WHERE empresa_id = $1 AND lower(${columna}) = $2 LIMIT 2`,
      [empresaId, v]
    );
    if (r.rows.length === 1) return r.rows[0].id;
    if (r.rows.length > 1) return null;
  }
  return null;
}

/** Operador que originó una llamada de IA (por su CallSid), si la plataforma lo informó y se identificó. */
export async function operadorDeLlamada(callSid: string): Promise<string | null> {
  const r = await pool.query<{ operador_usuario_id: string | null }>(
    "SELECT operador_usuario_id FROM llamadas_webhook WHERE call_sid = $1 ORDER BY creado_en DESC LIMIT 1",
    [callSid]
  );
  return r.rows[0]?.operador_usuario_id ?? null;
}
