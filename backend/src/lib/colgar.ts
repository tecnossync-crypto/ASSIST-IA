import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "./twilio-empresa.js";

type ClienteTwilio = NonNullable<Awaited<ReturnType<typeof clienteTwilioEmpresa>>>["client"];

const FINALES = ["completed", "canceled", "busy", "failed", "no-answer"];

/**
 * Termina UNA llamada de Twilio sea cual sea su estado. Twilio solo acepta `completed` para una llamada ya contestada
 * y `canceled` para una que todavía está en cola o timbrando: mandar el estado equivocado la deja viva (y el error
 * se perdía en silencio, por eso a veces "Twilio ignoraba" el colgar). Se pregunta el estado real primero y, si aun
 * así falla, se prueba con el otro.
 */
export async function terminarLlamadaTwilio(
  client: ClienteTwilio,
  sid: string
): Promise<"terminada" | "ya_terminada" | "error"> {
  try {
    const c = await client.calls(sid).fetch();
    if (FINALES.includes(c.status)) return "ya_terminada";
    const nuevo = c.status === "queued" || c.status === "ringing" ? "canceled" : "completed";
    await client.calls(sid).update({ status: nuevo });
    return "terminada";
  } catch {
    for (const status of ["completed", "canceled"] as const) {
      try {
        await client.calls(sid).update({ status });
        return "terminada";
      } catch {
        // prueba con el otro estado
      }
    }
    return "error";
  }
}

/**
 * Corta una llamada de punta a punta: la conferencia entera (saca a todos los que estén dentro, cliente y asesores) y
 * además cada pierna por separado (por si alguna no estaba ya en la conferencia: cliente timbrando, buzón de voz,
 * asesor conectándose). `sids` son piernas que ya se conocen (la del cliente, la del asesor).
 */
export async function terminarLlamadaCompleta(
  empresaId: string,
  sids: string[]
): Promise<{ ok: boolean; terminadas: number; errores: number }> {
  const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
  if (!twilioEmpresa) return { ok: false, terminadas: 0, errores: 0 };
  const { client } = twilioEmpresa;

  const conocidos = sids.filter(Boolean);
  const todos = new Set<string>(conocidos);
  let conferencia: string | null = null;

  if (conocidos.length > 0) {
    const r = await pool.query<{ id: string; call_sid: string; conferencia_nombre: string | null; agentes_call_sids: string[] }>(
      `SELECT id, call_sid, conferencia_nombre, agentes_call_sids FROM llamadas
       WHERE empresa_id = $1 AND (call_sid = ANY($2) OR agente_call_sid = ANY($2) OR agentes_call_sids && $2::text[])
       ORDER BY iniciada_en DESC LIMIT 1`,
      [empresaId, conocidos]
    );
    const llamada = r.rows[0];
    if (llamada) {
      todos.add(llamada.call_sid);
      for (const s of llamada.agentes_call_sids ?? []) todos.add(s);
      conferencia = llamada.conferencia_nombre ?? `llamada-${llamada.id}`;
    }
  }

  // 1) La conferencia completa: es lo que de verdad desconecta a todos a la vez.
  if (conferencia) {
    try {
      const abiertas = await client.conferences.list({ friendlyName: conferencia, status: "in-progress", limit: 1 });
      if (abiertas[0]) await client.conferences(abiertas[0].sid).update({ status: "completed" });
    } catch {
      // se sigue con las piernas
    }
  }

  // 2) Cada pierna por su cuenta.
  const resultados = await Promise.all([...todos].map((sid) => terminarLlamadaTwilio(client, sid)));
  const errores = resultados.filter((x) => x === "error").length;
  return { ok: errores === 0, terminadas: resultados.filter((x) => x === "terminada").length, errores };
}

/**
 * El CLIENTE terminó su llamada (colgó, se cayó, el buzón cortó): se cierra TODO lo que quede de esa llamada, ya mismo
 * y sin esperar a ninguna revisión periódica: la conferencia, la pierna del asesor (navegador / extensión / central) y
 * el registro en la base. Si `call_sid` no es el de un cliente (por ejemplo es la pierna de un asesor), no hace nada.
 */
export async function cerrarLlamadaSiClienteTermino(callSid: string): Promise<boolean> {
  const r = await pool.query<{
    id: string;
    empresa_id: string;
    call_sid: string;
    agente_call_sid: string | null;
    agentes_call_sids: string[] | null;
  }>(
    "SELECT id, empresa_id, call_sid, agente_call_sid, agentes_call_sids FROM llamadas WHERE call_sid = $1",
    [callSid]
  );
  const l = r.rows[0];
  if (!l) return false;

  const piernas = [...new Set([...(l.agentes_call_sids ?? []), ...(l.agente_call_sid ? [l.agente_call_sid] : [])])];
  await terminarLlamadaCompleta(l.empresa_id, [l.call_sid, ...piernas]);

  // Respaldo por si el aviso de "completada" de Twilio no llega: el aviso normal, cuando llega, corrige la duración exacta.
  await pool.query(
    `UPDATE llamadas
     SET estado = CASE WHEN resultado_automatico IS NOT NULL THEN 'fallida' ELSE 'completada' END,
         finalizada_en = now(),
         duracion_segundos = COALESCE(duracion_segundos, GREATEST(0, EXTRACT(EPOCH FROM (now() - iniciada_en))::int))
     WHERE id = $1 AND finalizada_en IS NULL`,
    [l.id]
  );
  return true;
}

