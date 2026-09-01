import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Storage propio para grabaciones (Cloudflare R2 o S3 — ambos hablan la
 * misma API). R2 no cobra egress, por eso es la opción recomendada en el
 * plan, pero cualquier endpoint S3-compatible funciona.
 */

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;

  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Variables de STORAGE_* no configuradas");
  }

  client = new S3Client({
    endpoint,
    region: "auto",
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
