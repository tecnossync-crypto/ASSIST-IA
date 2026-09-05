import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";

/** Prefijo para que se distinga a simple vista de otros tipos de token. */
export function generarApiKey(): string {
  return `via_${randomBytes(24).toString("hex")}`;
}

/** Resuelve qué empresa está pidiendo la llamada según el API key mandado. */
export async function empresaPorApiKey(apiKey: string): Promise<{ id: string } | null> {
  const result = await pool.query<{ id: string }>("SELECT id FROM empresas WHERE api_key = $1", [apiKey]);
  return result.rows[0] ?? null;
}
