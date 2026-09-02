import { pool } from "../db/pool.js";

const CAMPOS_DEDICADOS = new Set(["nombre", "apellido"]);

/**
 * Crea o actualiza el perfil del contacto con un dato que el agente acaba
 * de capturar. "nombre"/"apellido" van a sus columnas dedicadas (para
 * poder buscarlos/mostrarlos fácil); cualquier otro campo (los
 * personalizados de cada empresa) va al JSONB `datos`.
 */
export async function upsertContacto(empresaId: string, numero: string, campo: string, valor: string) {
  const campoNormalizado = campo.trim().toLowerCase();

  if (campoNormalizado === "nombre") {
    await pool.query(
      `INSERT INTO contactos (empresa_id, numero, nombre)
       VALUES ($1, $2, $3)
       ON CONFLICT (empresa_id, numero)
       DO UPDATE SET nombre = $3, actualizado_en = now()`,
      [empresaId, numero, valor]
    );
    return;
  }

  if (campoNormalizado === "apellido") {
    await pool.query(
      `INSERT INTO contactos (empresa_id, numero, apellido)
       VALUES ($1, $2, $3)
       ON CONFLICT (empresa_id, numero)
       DO UPDATE SET apellido = $3, actualizado_en = now()`,
      [empresaId, numero, valor]
    );
    return;
  }

  if (!CAMPOS_DEDICADOS.has(campoNormalizado)) {
    await pool.query(
      `INSERT INTO contactos (empresa_id, numero, datos)
       VALUES ($1, $2, jsonb_build_object($3::text, $4::text))
       ON CONFLICT (empresa_id, numero)
       DO UPDATE SET datos = contactos.datos || jsonb_build_object($3::text, $4::text), actualizado_en = now()`,
      [empresaId, numero, campo, valor]
    );
  }
}

/**
 * Asegura que exista una fila de contacto para este número, aunque el
 * agente todavía no haya capturado ningún dato de él (ej. apenas contestó
 * el teléfono). Así toda llamada deja rastro en el módulo de contactos.
 */
export async function asegurarContacto(empresaId: string, numero: string) {
  await pool.query(
    `INSERT INTO contactos (empresa_id, numero) VALUES ($1, $2)
     ON CONFLICT (empresa_id, numero) DO NOTHING`,
    [empresaId, numero]
  );
}
