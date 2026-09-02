import twilio from "twilio";
import { pool } from "../db/pool.js";
import { desencriptar } from "./crypto.js";

/**
 * Cliente Twilio + número remitente de una empresa, desencriptando su
 * auth_token guardado. Centralizado acá porque lo usan tanto la llamada
 * saliente manual (dashboard) como el despachador de campañas.
 */
export async function clienteTwilioEmpresa(empresaId: string) {
  const result = await pool.query<{
    twilio_account_sid: string | null;
    twilio_auth_token_enc: string | null;
    twilio_phone_number: string | null;
  }>(
    "SELECT twilio_account_sid, twilio_auth_token_enc, twilio_phone_number FROM empresas WHERE id = $1",
    [empresaId]
  );

  const row = result.rows[0];
  if (!row?.twilio_account_sid || !row.twilio_auth_token_enc || !row.twilio_phone_number) {
    return null;
  }

  const authToken = desencriptar(row.twilio_auth_token_enc);
  return {
    client: twilio(row.twilio_account_sid, authToken),
    fromNumber: row.twilio_phone_number,
  };
}
