import { cookies } from "next/headers";
import { registrarAuditoria } from "./api";

/**
 * Sesión firmada del dashboard (quién entró, con qué rol) — la base para
 * saber "quién" hizo cada cambio en el registro de auditoría. Firma con
 * HMAC vía Web Crypto (funciona igual en middleware/Edge que en server
 * actions/Node), sin depender de una librería de JWT.
 */

export interface Sesion {
  usuarioId: string;
  nombre: string;
  rol: string;
  colaId: string | null;
}

const COOKIE_NAME = "sesion_voz_ia";
const SECRETO = process.env.SESSION_SECRET ?? "clave-de-desarrollo-cambiar-en-produccion";

async function obtenerClave(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey("raw", encoder.encode(SECRETO), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binario = "";
  arr.forEach((b) => (binario += String.fromCharCode(b)));
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binario = atob(base64);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

async function firmar(payload: string): Promise<string> {
  const clave = await obtenerClave();
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(payload));
  return base64UrlEncode(firma);
}

/** Codifica la sesión + firma en el valor de la cookie: payload.firma */
export async function codificarSesion(sesion: Sesion): Promise<string> {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(sesion)));
  const firma = await firmar(payload);
  return `${payload}.${firma}`;
}

/** Verifica la firma y devuelve la sesión, o null si es inválida/no existe. */
export async function decodificarSesion(valor: string | undefined | null): Promise<Sesion | null> {
  if (!valor) return null;
  const [payload, firma] = valor.split(".");
  if (!payload || !firma) return null;

  const firmaEsperada = await firmar(payload);
  if (firmaEsperada !== firma) return null;

  try {
    const json = new TextDecoder().decode(base64UrlDecode(payload));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Solo usable en server actions/route handlers (no en middleware). */
export async function crearSesionCookie(sesion: Sesion) {
  const valor = await codificarSesion(sesion);
  const store = await cookies();
  store.set(COOKIE_NAME, valor, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 días
  });
}

export async function cerrarSesionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Lee la sesión actual desde una server action o server component. */
export async function obtenerSesion(): Promise<Sesion | null> {
  const store = await cookies();
  return decodificarSesion(store.get(COOKIE_NAME)?.value);
}

export const NOMBRE_COOKIE_SESION = COOKIE_NAME;

/**
 * Atajo para usar al final de cada server action de Configuración: registra
 * quién (según la sesión actual) hizo qué cambio. Si por algo no hay sesión
 * (no debería pasar, el middleware ya la exige), igual queda un rastro con
 * "Desconocido" en vez de perderse silenciosamente.
 */
export async function auditar(accion: string, entidad: string, detalle?: Record<string, unknown>) {
  const sesion = await obtenerSesion();
  await registrarAuditoria({
    usuarioId: sesion?.usuarioId ?? "",
    usuarioNombre: sesion?.nombre ?? "Desconocido",
    accion,
    entidad,
    detalle,
  });
}
