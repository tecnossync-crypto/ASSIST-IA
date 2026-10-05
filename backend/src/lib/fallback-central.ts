import { clienteTwilioEmpresa } from "./twilio-empresa.js";

/**
 * Respaldo para las llamadas que salen por la central propia: si la central
 * no responde (Twilio da la llamada por "failed": 404 por IP no reconocida,
 * 504 por puerto cerrado o DDNS desactualizado, etc.), la llamada se
 * reintenta directo por Twilio en vez de perderse.
 *
 * Se guarda en memoria, indexado por CallSid, y NO en la URL del callback:
 * el webhook de estado es público y si el destino del reintento viniera en
 * la query cualquiera podría forzar llamadas a números arbitrarios con
 * nuestras credenciales de Twilio. Si el backend se reinicia justo entre
 * originar y fallar, ese reintento puntual simplemente no ocurre.
 */
interface DatosFallback {
  empresaId: string;
  numero: string;
  voiceUrl: string;
  statusCallback: string;
}

const pendientes = new Map<string, DatosFallback>();

export function registrarFallbackCentral(callSid: string, porCentralPropia: boolean, datos: DatosFallback) {
  if (!porCentralPropia) return;
  pendientes.set(callSid, datos);
  // Red de seguridad: una llamada que nunca reporta estado no debe dejar
  // la entrada colgada para siempre.
  setTimeout(() => pendientes.delete(callSid), 15 * 60 * 1000).unref();
}

export function descartarFallbackCentral(callSid: string) {
  pendientes.delete(callSid);
}

/**
 * Reintenta directo por Twilio una llamada que falló al salir por la central.
 * Devuelve true si había un respaldo pendiente y se lanzó el reintento.
 */
export async function reintentarDirectoSiCorresponde(callSid: string): Promise<boolean> {
  const datos = pendientes.get(callSid);
  if (!datos) return false;
  pendientes.delete(callSid);

  const twilioEmpresa = await clienteTwilioEmpresa(datos.empresaId);
  if (!twilioEmpresa) return false;

  const call = await twilioEmpresa.client.calls.create({
    to: datos.numero,
    from: twilioEmpresa.fromNumber,
    url: datos.voiceUrl,
    method: "POST",
    statusCallback: datos.statusCallback,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["completed"],
    timeout: twilioEmpresa.timeoutTimbrado,
  });
  console.log(
    `[fallback-central] la central no respondió para ${callSid} — reintentando directo por Twilio: ${call.sid} (${datos.numero})`
  );
  return true;
}
