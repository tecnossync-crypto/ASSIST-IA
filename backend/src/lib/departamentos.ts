import { pool } from "../db/pool.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Departamento (cola) de la empresa a partir de lo que mande una plataforma externa: su id, o su nombre tal como está
 * en Configuración → Enrutamiento (sin importar mayúsculas ni espacios de más). Solo cuenta si hay UNA coincidencia.
 */
export async function resolverDepartamento(
  empresaId: string,
  valor: unknown
): Promise<{ id: string; nombre: string } | null> {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  if (!v || v.length > 200) return null;

  if (UUID.test(v)) {
    const r = await pool.query<{ id: string; nombre: string }>(
      "SELECT id, nombre FROM colas WHERE id = $1 AND empresa_id = $2",
      [v, empresaId]
    );
    return r.rows[0] ?? null;
  }

  const r = await pool.query<{ id: string; nombre: string }>(
    "SELECT id, nombre FROM colas WHERE empresa_id = $1 AND lower(trim(nombre)) = lower($2) LIMIT 2",
    [empresaId, v]
  );
  return r.rows.length === 1 ? r.rows[0] : null;
}
