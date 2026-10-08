import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa, resolverDestinoSaliente } from "./twilio-empresa.js";
import { asegurarContacto } from "./contactos.js";
import { registrarFallbackCentral } from "./fallback-central.js";

/**
 * Origina una llamada saliente con IA (el bot contesta y lleva la
 * conversación con el guion normal de la empresa) — mismo TwiML
 * (voice-outbound) que usan las campañas y el webhook público de
 * /api/webhooks/llamadas, factorizado acá para que el disparador de flujos
 * "se agrega una etiqueta" (inmediato o programado) no duplique esta lógica.
 */
export async function iniciarLlamadaIA(opts: {
  empresaId: string;
  numero: string;
  origen?: string;
  /** Solicitud de webhook cuyo prompt debe usar esta llamada (ver llamadas_webhook). */
  llamadaWebhookId?: string;
}): Promise<{
  callSid: string;
}> {
  const { empresaId, numero, origen, llamadaWebhookId } = opts;
  const paramWebhook = llamadaWebhookId ? `&webhookLlamadaId=${llamadaWebhookId}` : "";
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (!publicBaseUrl) throw new Error("PUBLIC_BASE_URL no está configurado");

  const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
  if (!twilioEmpresa) throw new Error("La empresa no tiene credenciales Twilio configuradas");

  await asegurarContacto(empresaId, numero);

  // Si la empresa vinculó su propia central telefónica (PBX) para
  // salientes, la llamada sale por ahí (su troncal, ej. Claro) en vez de
  // por la red de Twilio — ver twilio-empresa.ts. Inactivo por defecto.
  const { to, porCentralPropia, sendDigits, urlExtra } = resolverDestinoSaliente(numero, twilioEmpresa.centralPropia);

  const call = await twilioEmpresa.client.calls.create({
    to,
    from: twilioEmpresa.fromNumber,
    url: `${publicBaseUrl}/webhooks/twilio/voice-outbound?empresaId=${empresaId}${paramWebhook}${urlExtra}`,
    method: "POST",
    statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["completed"],
    timeout: twilioEmpresa.timeoutTimbrado,
    sendDigits,
  });

  registrarFallbackCentral(call.sid, porCentralPropia, {
    empresaId,
    numero,
    voiceUrl: `${publicBaseUrl}/webhooks/twilio/voice-outbound?empresaId=${empresaId}${paramWebhook}`,
    statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
  });

  console.log(
    `[llamadas-ia] originada callSid=${call.sid} numero=${numero} origen=${origen ?? "-"}${porCentralPropia ? " (por central propia)" : ""}`
  );
  if (llamadaWebhookId) {
    await pool.query("UPDATE llamadas_webhook SET call_sid = $2 WHERE id = $1", [llamadaWebhookId, call.sid]);
  }
  return { callSid: call.sid };
}
