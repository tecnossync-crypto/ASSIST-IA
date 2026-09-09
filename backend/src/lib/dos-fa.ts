import { randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { encriptar, desencriptar } from "./crypto.js";

/**
 * Autenticación de dos pasos por app autenticadora (Google Authenticator,
 * Authy, etc.) — TOTP estándar (RFC 6238), 6 dígitos, cada 30s. El secreto
 * se guarda encriptado (misma lib/crypto.ts que las credenciales de
 * Twilio); los códigos de respaldo se guardan hasheados con bcrypt, nunca
 * en texto plano, igual que la contraseña.
 */

const EMISOR = "Plataforma Voz IA";

export function generarSecretoTotp(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** Encripta el secreto para guardarlo en `usuarios.totp_secret_enc`. */
export function encriptarSecretoTotp(secretoBase32: string): string {
  return encriptar(secretoBase32);
}

/** URI otpauth:// + imagen QR (data URL) para escanear con la app. */
export async function generarQrTotp(secretoBase32: string, email: string): Promise<{ uri: string; qrDataUrl: string }> {
  const totp = new OTPAuth.TOTP({
    issuer: EMISOR,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretoBase32),
  });
  const uri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { uri, qrDataUrl };
}

/** Verifica un código de 6 dígitos contra el secreto encriptado guardado. */
export function verificarCodigoTotp(secretoEncriptado: string, codigo: string): boolean {
  const secretoBase32 = desencriptar(secretoEncriptado);
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretoBase32),
  });
  // window: 1 = tolera hasta 30s de desfase de reloj del teléfono en
  // cualquier dirección, sin abrir una ventana de validez demasiado ancha.
  const delta = totp.validate({ token: codigo.trim(), window: 1 });
  return delta !== null;
}

/** Genera N códigos de respaldo legibles (ej. "A3F9-K7QZ") + sus hashes para guardar. */
export async function generarCodigosRespaldo(cantidad = 8): Promise<{ codigos: string[]; hashes: string[] }> {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const codigos: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    const bytes = randomBytes(8);
    let out = "";
    for (const b of bytes) out += alfabeto[b % alfabeto.length];
    codigos.push(`${out.slice(0, 4)}-${out.slice(4, 8)}`);
  }
  const hashes = await Promise.all(codigos.map((c) => bcrypt.hash(c, 10)));
  return { codigos, hashes };
}

/** Verifica un código de respaldo contra la lista de hashes guardada; devuelve el índice usado (o -1). */
export async function verificarCodigoRespaldo(hashes: string[], codigo: string): Promise<number> {
  const normalizado = codigo.trim().toUpperCase();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalizado, hashes[i])) return i;
  }
  return -1;
}
