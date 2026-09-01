import { createHash } from "node:crypto";
import twilio from "twilio";
import { pool } from "../db/pool.js";
import { desencriptar } from "../lib/crypto.js";
import { subirGrabacion } from "../lib/storage.js";

/**
 * Se dispara desde el webhook recordingStatusCallback cuando Twilio avisa
 * que una grabación ya está lista. Descarga el audio, lo sube a storage
 * propio con hash de integridad, y borra el original en Twilio para no
 * pagar doble almacenamiento. Corre en segundo plano (no bloquea el ack
 * al webhook de Twilio).
 */
export async function procesarGrabacion(opts: {
  callSid: string;
  recordingSid: string;
  recordingDurationSegundos: number | null;
}) {
  const { callSid, recordingSid, recordingDurationSegundos } = opts;

  const llamada = await pool.query<{ id: string; empresa_id: string }>(
    "SELECT id, empresa_id FROM llamadas WHERE call_sid = $1",
    [callSid]
  );
  if (llamada.rows.length === 0) {
    throw new Error(`Llamada no encontrada para call_sid=${callSid}, no se puede procesar grabación`);
  }
  const { id: llamadaId, empresa_id: empresaId } = llamada.rows[0];

  const empresa = await pool.query<{
    twilio_account_sid: string | null;
    twilio_auth_token_enc: string | null;
  }>("SELECT twilio_account_sid, twilio_auth_token_enc FROM empresas WHERE id = $1", [empresaId]);

  const { twilio_account_sid: accountSid, twilio_auth_token_enc: authTokenEnc } =
    empresa.rows[0] ?? {};
  if (!accountSid || !authTokenEnc) {
    throw new Error(`Empresa ${empresaId} no tiene credenciales Twilio configuradas`);
  }
  const authToken = desencriptar(authTokenEnc);

  const client = twilio(accountSid, authToken);

  // Descargar el audio directo desde la URL de medios de Twilio, autenticado
  // con Basic Auth (accountSid:authToken) — misma credencial que el cliente SDK.
  const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
  const res = await fetch(mediaUrl, {
    headers: { authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
  });
  if (!res.ok) {
    throw new Error(`No se pudo descargar la grabación ${recordingSid}: HTTP ${res.status}`);
  }
  const audioBuffer = Buffer.from(await res.arrayBuffer());

  const hash = createHash("sha256").update(audioBuffer).digest("hex");
  const key = `${empresaId}/${llamadaId}/${recordingSid}.mp3`;

  const urlStorage = await subirGrabacion({ key, body: audioBuffer, contentType: "audio/mpeg" });

  await pool.query(
    `INSERT INTO grabaciones (empresa_id, llamada_id, url_storage, duracion_segundos, hash_integridad)
     VALUES ($1, $2, $3, $4, $5)`,
    [empresaId, llamadaId, urlStorage, recordingDurationSegundos, hash]
  );

  // Borrar en Twilio solo después de confirmar que ya quedó en storage propio.
  await client.recordings(recordingSid).remove();
}
