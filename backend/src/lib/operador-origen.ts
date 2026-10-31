import { pool } from "../db/pool.js";

/**
 * Modo de reparto "Al operador que originó la llamada": una plataforma externa
 * (ej. Zoho SalesIQ) pide la llamada de IA y manda en el POST qué operador la
 * disparó (campo `operador`). Si la IA después transfiere a una persona, le
 * suena a ESE operador — si está activo; si no, se reparte como "suena en todos".
 */

/** "Zoho-SalesIQ " -> "zoho-salesiq". Vacío si no viene una fuente. */
export function normalizarFuente(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().toLowerCase().slice(0, 80) : "";
}

/** La fuente de la solicitud (su `origen`, ej. "zoho-salesiq") corresponde a una fuente registrada (ej. "salesiq"). */
const coincideFuente = (solicitada: string, registrada: string) => solicitada === registrada || solicitada.includes(registrada);

/**
 * Identifica a un asesor de la empresa por lo que mandó la plataforma externa:
 *  1. Por su id en ESA plataforma (Configuración → Agentes → "Ids por plataforma"): la plataforma se reconoce por el
 *     `origen` de la solicitud (debe contener el nombre de la fuente registrada, ej. "salesiq" o "crm"). Así un id que
 *     en SalesIQ es de una persona y en el CRM de otra no se confunde.
 *  2. Por su "Id externo" general, su email o su nombre exacto.
 *  3. Si la solicitud no trae una fuente conocida, por cualquier id por plataforma que sea único.
 * Solo cuenta si hay UNA coincidencia: ante la duda (dos asesores con el mismo valor) no se adivina.
 */
export async function resolverOperadorExterno(empresaId: string, valor: unknown, fuente?: unknown): Promise<string | null> {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase();
  if (!v || v.length > 200) return null;
  const f = normalizarFuente(fuente);

  const ids = await pool.query<{ usuario_id: string; fuente: string }>(
    "SELECT usuario_id, fuente FROM usuarios_ids_externos WHERE empresa_id = $1 AND lower(valor) = $2",
    [empresaId, v]
  );
  let fuenteConocida = false;
  if (f) {
    const propios = ids.rows.filter((r) => coincideFuente(f, r.fuente));
    const usuarios = new Set(propios.map((r) => r.usuario_id));
    if (usuarios.size === 1) return [...usuarios][0];
    if (usuarios.size > 1) return null;
    // ¿La empresa registró ids para esta fuente (con otro valor)? Entonces no se cae a los de otras plataformas.
    const registradas = await pool.query<{ fuente: string }>(
      "SELECT DISTINCT fuente FROM usuarios_ids_externos WHERE empresa_id = $1",
      [empresaId]
    );
    fuenteConocida = registradas.rows.some((r) => coincideFuente(f, r.fuente));
  }

  for (const columna of ["id_externo", "email", "nombre"] as const) {
    const r = await pool.query<{ id: string }>(
      `SELECT id FROM usuarios WHERE empresa_id = $1 AND lower(${columna}) = $2 LIMIT 2`,
      [empresaId, v]
    );
    if (r.rows.length === 1) return r.rows[0].id;
    if (r.rows.length > 1) return null;
  }

  if (!fuenteConocida) {
    const usuarios = new Set(ids.rows.map((r) => r.usuario_id));
    if (usuarios.size === 1) return [...usuarios][0];
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
