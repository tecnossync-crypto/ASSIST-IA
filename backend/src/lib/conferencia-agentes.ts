import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "./twilio-empresa.js";
import { elegirAgentesParaLlamada } from "./agentes.js";

/**
 * Marca a los agentes que correspondan (según colas/enrutamiento) para que
 * se unan a la conferencia de una llamada — usado tanto por "llamada
 * normal" (routes/webhooks-twilio.ts) como por la transferencia del bot a
 * un humano (post-relay), para que ambos casos se comporten igual: mismo
 * reparto de carga, y el admin puede monitorear/escuchar cualquiera de las
 * dos desde Supervisión.
 *
 * Devuelve las identidades marcadas (vacío si no hay ningún agente
 * disponible — quien llama decide qué hacer en ese caso, ej. caer a un
 * número externo de respaldo).
 */
export async function iniciarConferenciaConAgentes(opts: {
  empresaId: string;
  llamadaId: string;
  conferenciaNombre: string;
  colaId?: string | null;
  publicBaseUrl: string;
}): Promise<{ identidades: string[] }> {
  const { empresaId, llamadaId, conferenciaNombre, colaId, publicBaseUrl } = opts;

  const identidadesAgentes = await elegirAgentesParaLlamada(empresaId, colaId);
  if (identidadesAgentes.length === 0) return { identidades: [] };

  const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
  if (!twilioEmpresa) return { identidades: [] };

  // Marca a todos los agentes elegidos a la vez (uno solo si el modo es
  // round_robin/disponibilidad/menos_llamadas/ultimo_operador): cada
  // pierna, al contestar, entra a la MISMA conferencia y la arranca — la
  // primera en entrar gana, y conferencia-evento cancela las demás.
  const agenteUrl = `${publicBaseUrl}/webhooks/twilio/conferencia-agente?conferencia=${encodeURIComponent(conferenciaNombre)}`;
  const intentos = await Promise.all(
    identidadesAgentes.map((identidad) =>
      twilioEmpresa.client.calls
        .create({
          to: `client:${identidad}`,
          from: twilioEmpresa.fromNumber,
          url: agenteUrl,
          method: "POST",
          timeout: twilioEmpresa.timeoutTimbrado,
        })
        .then((c) => ({ callSid: c.sid, identidad }))
        .catch(() => null)
    )
  );
  const exitosos = intentos.filter((i): i is { callSid: string; identidad: string } => Boolean(i));
  if (exitosos.length === 0) return { identidades: [] };

  const callSidsAgentes = exitosos.map((i) => i.callSid);
  const identidadPorCallSid = Object.fromEntries(exitosos.map((i) => [i.callSid, i.identidad]));

  await pool.query(
    `UPDATE llamadas SET conferencia_nombre = $2, agentes_call_sids = $3, agentes_call_sids_identidad = $4 WHERE id = $1`,
    [llamadaId, conferenciaNombre, callSidsAgentes, JSON.stringify(identidadPorCallSid)]
  );

  return { identidades: exitosos.map((i) => i.identidad) };
}
