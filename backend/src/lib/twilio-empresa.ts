import twilio from "twilio";
import { pool } from "../db/pool.js";
import { desencriptar } from "./crypto.js";

export interface CentralPropiaConfig {
  dominio: string;
  authTipo: "ip" | "credenciales";
  usuario: string | null;
  password: string | null;
  saliente: boolean;
  entrante: boolean;
}

/**
 * Cliente Twilio + número remitente + configuración de timbrado de una
 * empresa, desencriptando su auth_token guardado. Centralizado acá porque
 * lo usan tanto la llamada saliente manual (dashboard) como el despachador
 * de campañas.
 *
 * `centralPropia`: si la empresa vinculó su propia central telefónica (PBX)
 * vía troncal SIP — ver migración 039 y resolverDestinoSaliente() abajo.
 * null si no la configuró o no la tiene activa.
 */
export async function clienteTwilioEmpresa(empresaId: string) {
  const result = await pool.query<{
    twilio_account_sid: string | null;
    twilio_auth_token_enc: string | null;
    twilio_phone_number: string | null;
    timeout_timbrado_segundos: number;
    central_propia_activa: boolean;
    central_propia_dominio: string | null;
    central_propia_auth_tipo: "ip" | "credenciales" | null;
    central_propia_usuario: string | null;
    central_propia_password_enc: string | null;
    central_propia_saliente: boolean;
    central_propia_entrante: boolean;
  }>(
    `SELECT twilio_account_sid, twilio_auth_token_enc, twilio_phone_number, timeout_timbrado_segundos,
            central_propia_activa, central_propia_dominio, central_propia_auth_tipo,
            central_propia_usuario, central_propia_password_enc, central_propia_saliente, central_propia_entrante
     FROM empresas WHERE id = $1`,
    [empresaId]
  );

  const row = result.rows[0];
  if (!row?.twilio_account_sid || !row.twilio_auth_token_enc || !row.twilio_phone_number) {
    return null;
  }

  const authToken = desencriptar(row.twilio_auth_token_enc);

  const centralPropia: CentralPropiaConfig | null =
    row.central_propia_activa && row.central_propia_dominio
      ? {
          dominio: row.central_propia_dominio,
          authTipo: row.central_propia_auth_tipo ?? "ip",
          usuario: row.central_propia_usuario,
          password: row.central_propia_password_enc ? desencriptar(row.central_propia_password_enc) : null,
          saliente: row.central_propia_saliente,
          entrante: row.central_propia_entrante,
        }
      : null;

  return {
    client: twilio(row.twilio_account_sid, authToken),
    fromNumber: row.twilio_phone_number,
    timeoutTimbrado: row.timeout_timbrado_segundos,
    centralPropia,
  };
}

/**
 * A dónde debe marcar Twilio para que la llamada SALGA por la central
 * propia del cliente en vez de por la red de Twilio — un SIP URI hacia su
 * PBX (que a su vez la saca por su troncal, ej. Claro) en vez del número de
 * teléfono directo. Si no tiene central propia activa para salientes,
 * devuelve el número tal cual (comportamiento de siempre).
 *
 * OJO: la sintaxis exacta del URI (usuario, puerto, parámetros) depende de
 * cómo quede configurado el troncal SIP del lado de Twilio (Elastic SIP
 * Trunking) — esto necesita probarse en vivo contra la PBX real antes de
 * confiar en que funciona; no se activa para nadie hasta que
 * central_propia_activa se ponga en true explícitamente.
 */
export function resolverDestinoSaliente(
  numero: string,
  centralPropia: CentralPropiaConfig | null
): { to: string; porCentralPropia: boolean } {
  if (!centralPropia?.saliente) {
    return { to: numero, porCentralPropia: false };
  }

  const numeroLimpio = numero.replace(/^\+/, "");
  const credenciales =
    centralPropia.authTipo === "credenciales" && centralPropia.usuario ? `${centralPropia.usuario}@` : "";

  return {
    to: `sip:${credenciales}${numeroLimpio}@${centralPropia.dominio}`,
    porCentralPropia: true,
  };
}
