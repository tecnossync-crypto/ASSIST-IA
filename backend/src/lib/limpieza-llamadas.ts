import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "./twilio-empresa.js";
import { terminarLlamadaCompleta, terminarLlamadaTwilio } from "./colgar.js";

/**
 * Red de seguridad para que ninguna llamada quede abierta en Twilio. El camino normal ya cuelga a todos (el asesor
 * entra con endConferenceOnExit=true y, en transferencias entre asesores, se maneja en "participant-leave"), pero si un
 * aviso de Twilio se pierde o el servidor se reinicia a mitad, una pierna puede quedar viva: el cliente escuchando
 * silencio mientras el asesor ya colgó, o el asesor "en llamada" con un cliente que ya se fue.
 *
 * Cada minuto revisa las llamadas que la base cree abiertas y compara con el estado real en Twilio:
 *  - El asesor ya no está pero el cliente sigue en la línea  -> se cuelga al cliente.
 *  - El cliente ya no está pero alguna pierna de asesor sigue -> se cuelgan esas piernas.
 *  - La llamada terminó en Twilio y la base la sigue viendo abierta -> se cierra en la base.
 *  - Llamada de IA que superó su duración máxima (+3 min) sin pasar a un asesor -> se corta (cliente en línea sin que
 *    el bot la cierre).
 *  - Lleva más del máximo permitido abierta -> se corta de punta a punta.
 * Para no pelear con el camino normal (que reacciona en segundos), solo se actúa si lo mismo se observa en dos
 * revisiones seguidas.
 */

const FINALES = ["completed", "canceled", "busy", "failed", "no-answer"];
const MAX_MINUTOS = Number(process.env.LLAMADA_MAX_MINUTOS ?? 240);

const vistas = new Map<string, string>(); // id de llamada -> problema visto en la revisión anterior

export async function limpiarLlamadasHuerfanas(): Promise<{ revisadas: number; corregidas: number }> {
  const candidatas = await pool.query<{
    id: string;
    empresa_id: string;
    call_sid: string;
    agente_call_sid: string | null;
    agentes_call_sids: string[] | null;
    iniciada_en: Date;
    transferida: boolean;
    conferencia_nombre: string | null;
    max_segundos: number;
  }>(
    `SELECT l.id, l.empresa_id, l.call_sid, l.agente_call_sid, l.agentes_call_sids, l.iniciada_en, l.transferida,
            l.conferencia_nombre, COALESCE(e.duracion_maxima_llamada_segundos, 600) AS max_segundos
     FROM llamadas l JOIN empresas e ON e.id = l.empresa_id
     WHERE l.finalizada_en IS NULL AND l.estado = 'en_curso'
       AND l.iniciada_en < now() - interval '90 seconds' AND l.iniciada_en > now() - interval '3 days'
     ORDER BY l.iniciada_en LIMIT 60`
  );

  const idsActuales = new Set(candidatas.rows.map((c) => c.id));
  for (const id of [...vistas.keys()]) if (!idsActuales.has(id)) vistas.delete(id);

  let corregidas = 0;
  for (const c of candidatas.rows) {
    try {
      const twilioEmpresa = await clienteTwilioEmpresa(c.empresa_id);
      if (!twilioEmpresa) continue;
      const { client } = twilioEmpresa;

      const estadoDe = async (sid: string): Promise<string> => {
        try {
          return (await client.calls(sid).fetch()).status;
        } catch {
          return "desconocido";
        }
      };

      const cliente = await estadoDe(c.call_sid);
      const clienteTermino = FINALES.includes(cliente);
      const sidsAsesores = [...new Set([...(c.agentes_call_sids ?? []), ...(c.agente_call_sid ? [c.agente_call_sid] : [])])];
      const asesores = await Promise.all(sidsAsesores.map(async (sid) => ({ sid, estado: await estadoDe(sid) })));
      const asesoresVivos = asesores.filter((a) => !FINALES.includes(a.estado) && a.estado !== "desconocido");
      const minutosAbierta = (Date.now() - new Date(c.iniciada_en).getTime()) / 60_000;

      let problema: string | null = null;
      // Llamada de IA que nunca pasó a un asesor y ya superó su duración máxima (la que configura la empresa, que el
      // voice-server hace cumplir) más un margen: el voice-server o Twilio la dejaron colgada con el cliente en línea.
      const iaSinCerrar =
        !clienteTermino &&
        !c.agente_call_sid &&
        sidsAsesores.length === 0 &&
        !c.transferida &&
        !c.conferencia_nombre &&
        minutosAbierta * 60 > c.max_segundos + 180;
      if (minutosAbierta > MAX_MINUTOS && !clienteTermino) problema = "demasiado_larga";
      else if (iaSinCerrar) problema = "ia_sin_cerrar";
      else if (clienteTermino && asesoresVivos.length > 0) problema = "asesor_sin_cliente";
      else if (clienteTermino && asesoresVivos.length === 0) problema = "cerrar_en_base";
      else if (
        !clienteTermino &&
        c.agente_call_sid && // un asesor llegó a atender esta llamada
        asesores.length > 0 &&
        asesores.every((a) => FINALES.includes(a.estado))
      ) {
        problema = "cliente_sin_asesor";
      }
      if (!problema) {
        vistas.delete(c.id);
        continue;
      }

      // "Cerrar en base" y el tope no necesitan esperar; lo demás sí (dos revisiones seguidas).
      // Si el cliente ya no está, no hay nada que esperar: se cuelga al asesor de inmediato.
      const confirmado =
        problema === "demasiado_larga" ||
        problema === "cerrar_en_base" ||
        problema === "asesor_sin_cliente" ||
        vistas.get(c.id) === problema;
      if (!confirmado) {
        vistas.set(c.id, problema);
        continue;
      }
      vistas.delete(c.id);

      if (problema === "cliente_sin_asesor" || problema === "demasiado_larga" || problema === "ia_sin_cerrar") {
        await terminarLlamadaCompleta(c.empresa_id, [c.call_sid, ...sidsAsesores]);
      } else if (problema === "asesor_sin_cliente") {
        await Promise.all(asesoresVivos.map((a) => terminarLlamadaTwilio(client, a.sid)));
      }
      await pool.query(
        `UPDATE llamadas SET estado = CASE WHEN $2 = 'completed' OR $2 IS NULL THEN 'completada' ELSE 'fallida' END,
                finalizada_en = now()
         WHERE id = $1 AND finalizada_en IS NULL`,
        [c.id, clienteTermino ? cliente : null]
      );
      console.warn(`[limpieza-llamadas] llamada ${c.call_sid} cerrada (${problema})`);
      corregidas++;
    } catch (err) {
      console.error(`[limpieza-llamadas] error revisando ${c.call_sid}:`, err);
    }
  }
  return { revisadas: candidatas.rows.length, corregidas };
}
