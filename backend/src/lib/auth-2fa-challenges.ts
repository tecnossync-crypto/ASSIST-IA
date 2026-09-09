import { randomBytes } from "node:crypto";

/**
 * Estado intermedio "contraseña correcta, falta el código 2FA" — vive en
 * memoria del proceso (no en la base): son tokens de un solo uso, de vida
 * muy corta (2 min), que no necesitan sobrevivir un reinicio del backend
 * (si el backend se reinicia a mitad de un login, el usuario simplemente
 * vuelve a intentar). Con un solo contenedor de backend (ver docker-compose)
 * esto es suficiente; si algún día hay más de una instancia, esto tendría
 * que moverse a Redis o Postgres.
 */

const TTL_MS = 2 * 60 * 1000;

interface Desafio {
  usuarioId: string;
  expiraEn: number;
}

const desafios = new Map<string, Desafio>();

function limpiarVencidos() {
  const ahora = Date.now();
  for (const [token, d] of desafios) {
    if (d.expiraEn < ahora) desafios.delete(token);
  }
}

/** Se llama justo después de validar la contraseña, cuando el usuario tiene 2FA activo. */
export function crearDesafio2FA(usuarioId: string): string {
  limpiarVencidos();
  const token = randomBytes(24).toString("base64url");
  desafios.set(token, { usuarioId, expiraEn: Date.now() + TTL_MS });
  return token;
}

/** Consume el token (de un solo uso) y devuelve el usuarioId si es válido y no venció. */
export function consumirDesafio2FA(token: string): string | null {
  const d = desafios.get(token);
  if (!d) return null;
  desafios.delete(token);
  if (d.expiraEn < Date.now()) return null;
  return d.usuarioId;
}
