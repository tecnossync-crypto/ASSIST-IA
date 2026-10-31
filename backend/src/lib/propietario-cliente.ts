import { pool } from "../db/pool.js";
import { resolverOperadorExterno } from "./operador-origen.js";
import { normalizarNumero } from "./telefono.js";

/** Campos con los que un CRM puede mandar el dueño del cliente (ej. "Propietario de Contacto" en Zoho). */
const CAMPOS_PROPIETARIO = [
  "propietario_email",
  "propietario_correo",
  "correo_propietario",
  "email_propietario",
  "owner_email",
  "contact_owner_email",
  "propietario",
  "propietario_contacto",
  "propietario_cliente",
  "contact_owner",
  "owner",
  "propietario_id",
];

export interface ResultadoPropietario {
  /** Lo que mandó el CRM, si mandó algo. */
  recibido: string | null;
  /** Usuario de la plataforma que se reconoció a partir de lo que mandó el CRM (null si no se reconoció o no se mandó). */
  usuarioId: string | null;
  /** Propietario que tiene el cliente al terminar (el recién asignado o el que ya tenía); null si no tiene. */
  propietarioId: string | null;
}

/**
 * Asigna el propietario del cliente según lo que mandó el CRM al pedir la llamada:
 *  - Si trae un campo de propietario explícito, el CRM manda: se asigna (si coincide con un usuario por id externo,
 *    email o nombre) y el texto original se guarda siempre.
 *  - Si solo trae `operador` (quien disparó la llamada) y el cliente aún no tiene propietario, se le asigna ese.
 * Nunca cambia el propietario a null ni lo reemplaza por alguien no reconocido.
 */
export async function mapearPropietarioCliente(
  empresaId: string,
  numeroCrudo: string,
  cuerpo: Record<string, unknown>,
  operadorUsuarioId: string | null
): Promise<ResultadoPropietario> {
  let recibido: string | null = null;
  let usuarioId: string | null = null;
  for (const campo of CAMPOS_PROPIETARIO) {
    const v = cuerpo[campo];
    if (typeof v === "string" && v.trim()) {
      recibido = v.trim().slice(0, 200);
      usuarioId = await resolverOperadorExterno(empresaId, recibido);
      break;
    }
  }
  const numero = normalizarNumero(numeroCrudo);

  if (recibido) {
    await pool.query(
      `UPDATE contactos SET propietario_externo = $3,
              propietario_usuario_id = COALESCE($4::uuid, propietario_usuario_id), actualizado_en = now()
       WHERE empresa_id = $1 AND numero = $2`,
      [empresaId, numero, recibido, usuarioId]
    );
  } else if (operadorUsuarioId) {
    await pool.query(
      `UPDATE contactos SET propietario_usuario_id = $3, actualizado_en = now()
       WHERE empresa_id = $1 AND numero = $2 AND propietario_usuario_id IS NULL`,
      [empresaId, numero, operadorUsuarioId]
    );
    usuarioId = operadorUsuarioId;
  }
  const actual = await pool.query<{ propietario_usuario_id: string | null }>(
    "SELECT propietario_usuario_id FROM contactos WHERE empresa_id = $1 AND numero = $2",
    [empresaId, numero]
  );
  return { recibido, usuarioId, propietarioId: actual.rows[0]?.propietario_usuario_id ?? null };
}
