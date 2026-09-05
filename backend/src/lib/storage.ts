import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";

/**
 * Storage propio para grabaciones. Funciona con S3 real de AWS (dejar
 * STORAGE_ENDPOINT vacío, usar STORAGE_REGION) o con cualquier servicio
 * S3-compatible como Cloudflare R2 (sí requiere STORAGE_ENDPOINT).
 */

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;

  const endpoint = process.env.STORAGE_ENDPOINT || undefined;
  const region = process.env.STORAGE_REGION || "us-east-1";
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Variables de STORAGE_* no configuradas");
  }

  client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  return client;
}

export async function subirGrabacion(opts: {
  key: string;
  body: Buffer;
  contentType?: string;
}): Promise<string> {
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new Error("STORAGE_BUCKET no está configurado");

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType ?? "audio/mpeg",
    })
  );

  return `${bucket}/${opts.key}`;
}

/**
 * URL firmada de corta duración para que el dashboard pueda reproducir la
 * grabación sin exponer el bucket como público. `urlStorage` es lo que
 * guardamos en `grabaciones.url_storage`, formato "bucket/key".
 */
export async function urlFirmadaGrabacion(urlStorage: string, expiraSegundos = 300): Promise<string> {
  const [bucket, ...keyParts] = urlStorage.split("/");
  const key = keyParts.join("/");

  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiraSegundos }
  );
}

/** Borra el archivo del storage (usado por la limpieza de retención). */
export async function eliminarGrabacion(urlStorage: string): Promise<void> {
  const [bucket, ...keyParts] = urlStorage.split("/");
  const key = keyParts.join("/");
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Stream del audio, para armar el ZIP de exportación sin cargar todo en memoria. */
export async function streamGrabacion(urlStorage: string): Promise<Readable> {
  const [bucket, ...keyParts] = urlStorage.split("/");
  const key = keyParts.join("/");
  const res = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return res.Body as Readable;
}
