import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encriptación simétrica para credenciales sensibles guardadas por empresa
 * (hoy: twilio_auth_token). AES-256-GCM con una clave derivada de
 * ENCRYPTION_KEY (env). No es KMS ni rotación de claves — suficiente para
 * Fase 0/1; revisar antes de manejar credenciales de muchos clientes.
 */

function obtenerClave(): Buffer {
  const secreto = process.env.ENCRYPTION_KEY;
  if (!secreto) {
    throw new Error("ENCRYPTION_KEY no está configurado");
  }
  // scrypt con salt fijo derivado del propio secreto: determinístico a
  // propósito para no tener que guardar un salt aparte. La seguridad real
  // depende de que ENCRYPTION_KEY sea largo y secreto.
  return scryptSync(secreto, "voz-ia-empresas", 32);
}

export function encriptar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", obtenerClave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Formato: iv.authTag.cifrado, todo en base64, separado por ".".
  return [iv, authTag, cifrado].map((b) => b.toString("base64")).join(".");
}

export function desencriptar(valor: string): string {
  const [ivB64, authTagB64, cifradoB64] = valor.split(".");
  if (!ivB64 || !authTagB64 || !cifradoB64) {
    throw new Error("Formato de valor encriptado inválido");
  }
  const decipher = createDecipheriv("aes-256-gcm", obtenerClave(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plano = Buffer.concat([
    decipher.update(Buffer.from(cifradoB64, "base64")),
    decipher.final(),
  ]);
  return plano.toString("utf-8");
}
