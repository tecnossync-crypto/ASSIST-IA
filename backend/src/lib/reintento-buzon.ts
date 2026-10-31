import { pool } from "../db/pool.js";
import { encolarLlamadaIA } from "./cola-salida-ia.js";

/** Reintentos por defecto de una solicitud de la API, si no manda `reintentos_buzon` / `minutos_reintento`. */
export function reintentosPorDefecto(): { reintentos: number; minutos: number } {
  const reintentos = Number(process.env.API_REINTENTOS_BUZON ?? 1);
  const minutos = Number(process.env.API_MINUTOS_REINTENTO ?? 20);
  return {
    reintentos: Number.isFinite(reintentos) ? Math.max(0, Math.min(5, Math.floor(reintentos))) : 1,
    minutos: Number.isFinite(minutos) ? Math.max(1, Math.min(1440, Math.floor(minutos))) : 20,
  };
}

/**
 * Se llama cuando termina una llamada de IA. Si fue pedida por la API con reintentos pendientes y no se logró hablar con
 * el cliente (cayó en buzón de voz, o no contestó / estaba ocupado), programa otra llamada N minutos después, con la misma
 * solicitud (guion, departamento, propietario, referencia). Cada llamada solo programa su reintento una vez.
 */
export async function programarReintentoSiNoContesto(callSid: string, status: string): Promise<boolean> {
  const r = await pool.query<{ buzon: boolean }>(
    `SELECT (l.resultado_automatico = 'buzon') AS buzon
     FROM llamadas_webhook w LEFT JOIN llamadas l ON l.call_sid = w.call_sid
     WHERE w.call_sid = $1 AND w.reintentos_restantes > 0 AND NOT w.reintento_creado
     LIMIT 1`,
    [callSid]
  );
  if (r.rows.length === 0) return false;
  const sinRespuesta = status === "no-answer" || status === "busy";
  if (!r.rows[0].buzon && !sinRespuesta) return false;

  // Se reserva el reintento de forma atómica y se copia la solicitud original.
  const orig = await pool.query(
    `UPDATE llamadas_webhook SET reintento_creado = true
     WHERE call_sid = $1 AND reintentos_restantes > 0 AND NOT reintento_creado
     RETURNING id, empresa_id, numero, prompt, origen, regla_aplicada_id, operador_usuario_id, operador_externo, cola_id,
               departamento_recibido, referencia, reintentos_restantes, minutos_reintento, intento`,
    [callSid]
  );
  const o = orig.rows[0];
  if (!o) return false;

  const minutos = o.minutos_reintento ?? reintentosPorDefecto().minutos;
  const nueva = await pool.query<{ id: string }>(
    `INSERT INTO llamadas_webhook (empresa_id, numero, prompt, origen, regla_aplicada_id, operador_usuario_id, operador_externo,
                                   cola_id, departamento_recibido, referencia, reintentos_restantes, minutos_reintento,
                                   reintento_de, intento, programada_para)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now() + ($15 || ' minutes')::interval)
     RETURNING id`,
    [
      o.empresa_id,
      o.numero,
      o.prompt,
      o.origen,
      o.regla_aplicada_id,
      o.operador_usuario_id,
      o.operador_externo,
      o.cola_id,
      o.departamento_recibido,
      o.referencia,
      o.reintentos_restantes - 1,
      o.minutos_reintento,
      o.id,
      o.intento + 1,
      String(minutos),
    ]
  );
  await encolarLlamadaIA({
    empresaId: o.empresa_id,
    numero: o.numero,
    fecha: new Date(Date.now() + minutos * 60_000),
    llamadaWebhookId: nueva.rows[0].id,
  });
  return true;
}
