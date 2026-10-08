import type { clienteTwilioEmpresa } from "./twilio-empresa.js";

type TwilioEmpresa = NonNullable<Awaited<ReturnType<typeof clienteTwilioEmpresa>>>;

/**
 * ¿Esta llamada ya tiene una grabación corriendo en Twilio? La IA arranca una
 * al contestar (<Start><Recording>) y sigue activa aunque después se transfiera
 * a un asesor; si al transferir se arrancara otra, la misma llamada quedaría
 * grabada dos veces. Si no se puede consultar, se responde "no" a propósito:
 * es preferible una grabación repetida a una llamada sin grabar.
 */
export async function llamadaYaSeGraba(twilioEmpresa: TwilioEmpresa | null, callSid: string): Promise<boolean> {
  if (!twilioEmpresa) return false;
  try {
    const grabaciones = await twilioEmpresa.client.calls(callSid).recordings.list({ limit: 20 });
    return grabaciones.some((g) => g.status === "in-progress" || g.status === "paused");
  } catch {
    return false;
  }
}
