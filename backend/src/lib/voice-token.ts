import twilio from "twilio";
import { pool } from "../db/pool.js";
import { desencriptar } from "./crypto.js";
import { identidadAgente } from "./agentes.js";

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

/**
 * Genera un Access Token de Twilio Voice SDK para que el softphone del
 * agente (dashboard web o ejecutable de escritorio) pueda recibir llamadas
 * — "llamada normal" se conecta acá en vez de reenviar a un teléfono
 * externo, y se le puede marcar a un agente específico o a varios a la vez.
 * `usuarioId` es opcional para no romper el softphone genérico del
 * dashboard (que aún no distingue agentes); si se omite, se usa una
 * identidad compartida de toda la empresa.
 */
export async function generarTokenVoz(
  empresaId: string,
  usuarioId?: string
): Promise<{ token: string; identity: string } | null> {
  const result = await pool.query<{
    twilio_account_sid: string | null;
    twilio_api_key_sid: string | null;
    twilio_api_key_secret_enc: string | null;
  }>(
    "SELECT twilio_account_sid, twilio_api_key_sid, twilio_api_key_secret_enc FROM empresas WHERE id = $1",
    [empresaId]
  );

  const row = result.rows[0];
  if (!row?.twilio_account_sid || !row.twilio_api_key_sid || !row.twilio_api_key_secret_enc) {
    return null;
  }

  const apiKeySecret = desencriptar(row.twilio_api_key_secret_enc);
  const identity = usuarioId ? identidadAgente(usuarioId) : `operador-${empresaId}`;

  const accessToken = new AccessToken(row.twilio_account_sid, row.twilio_api_key_sid, apiKeySecret, {
    identity,
    ttl: 3600,
  });

  accessToken.addGrant(new VoiceGrant({ incomingAllow: true }));

  return { token: accessToken.toJwt(), identity };
}
