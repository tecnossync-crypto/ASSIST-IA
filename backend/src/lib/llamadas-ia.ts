import { clienteTwilioEmpresa } from "./twilio-empresa.js";
import { asegurarContacto } from "./contactos.js";

/**
 * Origina una llamada saliente con IA (el bot contesta y lleva la
 * conversación con el guion normal de la empresa) — mismo TwiML
 * (voice-outbound) que usan las campañas y el webhook público de
 * /api/webhooks/llamadas, factorizado acá para que el disparador de flujos
 * "se agrega una etiqueta" (inmediato o programado) no duplique esta lógica.
 */
export async function iniciarLlamadaIA(opts: { empresaId: string; numero: string; origen?: string }): Promise<{
  callSid: string;
}> {
  const { empresaId, numero, origen } = opts;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (!publicBaseUrl) throw new Error("PUBLIC_BASE_URL no está configurado");

  const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
  if (!twilioEmpresa) throw new Error("La empresa no tiene credenciales Twilio configuradas");

  await asegurarContacto(empresaId, numero);

  const call = await twilioEmpresa.client.calls.create({
    to: numero,
    from: twilioEmpresa.fromNumber,
    url: `${publicBaseUrl}/webhooks/twilio/voice-outbound?empresaId=${empresaId}`,
    method: "POST",
    statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["completed"],
    timeout: twilioEmpresa.timeoutTimbrado,
  });

  console.log(`[llamadas-ia] originada callSid=${call.sid} numero=${numero} origen=${origen ?? "-"}`);
  return { callSid: call.sid };
}
