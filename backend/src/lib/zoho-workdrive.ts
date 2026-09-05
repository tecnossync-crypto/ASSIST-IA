/**
 * Integración con Zoho WorkDrive vía OAuth 2.0 (authorization code + refresh
 * token) — el cliente inicia sesión con SU PROPIA cuenta de Zoho y autoriza
 * el acceso; nunca compartimos ni pedimos su contraseña.
 *
 * Requiere que Tecnossync haya registrado una app en la consola de Zoho API
 * Console (https://api-console.zoho.com) UNA sola vez para toda la
 * plataforma — eso da el Client ID/Secret de acá abajo. Cada empresa cliente
 * conecta su propia carpeta por separado (ver empresas.zoho_workdrive_*).
 *
 * Zoho tiene varios datacenters (.com, .eu, .in, .com.cn, .jp) — el dominio
 * de cuentas (login/OAuth) se configura con ZOHO_ACCOUNTS_DOMAIN; el dominio
 * de la API real para cada empresa lo devuelve Zoho en el intercambio de
 * tokens (api_domain) y es el que hay que usar de ahí en adelante, no un
 * valor fijo.
 */

const ACCOUNTS_DOMAIN = process.env.ZOHO_ACCOUNTS_DOMAIN || "zoho.com";
const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;

export function zohoConfigurado(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function construirUrlAutorizacion(empresaId: string, redirectUri: string): string {
  if (!CLIENT_ID) throw new Error("ZOHO_CLIENT_ID no está configurado");
  const params = new URLSearchParams({
    scope: "WorkDrive.files.ALL",
    client_id: CLIENT_ID,
    response_type: "code",
    access_type: "offline", // necesario para recibir refresh_token
    redirect_uri: redirectUri,
    prompt: "consent",
    state: empresaId,
  });
  return `https://accounts.${ACCOUNTS_DOMAIN}/oauth/v2/auth?${params.toString()}`;
}

interface TokensZoho {
  access_token: string;
  refresh_token?: string;
  api_domain: string;
  expires_in: number;
}

export async function intercambiarCodigo(code: string, redirectUri: string): Promise<TokensZoho> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Zoho no está configurado (falta client id/secret)");

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(`https://accounts.${ACCOUNTS_DOMAIN}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Error obteniendo tokens de Zoho: ${JSON.stringify(data)}`);
  }
  return data;
}

async function renovarAccessToken(refreshToken: string): Promise<{ access_token: string; api_domain: string }> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Zoho no está configurado (falta client id/secret)");

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const res = await fetch(`https://accounts.${ACCOUNTS_DOMAIN}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Error renovando token de Zoho: ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Sube un archivo a la carpeta de WorkDrive configurada por la empresa.
 * Renueva el access token en cada llamada (son de corta duración, ~1h, y
 * esto solo corre una vez por grabación — no vale la pena cachearlo).
 */
export async function subirArchivoWorkDrive(opts: {
  refreshToken: string;
  carpetaId: string;
  nombreArchivo: string;
  contenido: Buffer;
}): Promise<void> {
  const { access_token, api_domain } = await renovarAccessToken(opts.refreshToken);

  const formData = new FormData();
  formData.append("content", new Blob([new Uint8Array(opts.contenido)]), opts.nombreArchivo);
  formData.append("filename", opts.nombreArchivo);
  formData.append("parent_id", opts.carpetaId);

  const res = await fetch(`${api_domain}/workdrive/api/v1/upload`, {
    method: "POST",
    headers: { authorization: `Zoho-oauthtoken ${access_token}` },
    body: formData,
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`Error subiendo archivo a WorkDrive: HTTP ${res.status} ${detalle}`);
  }
}
