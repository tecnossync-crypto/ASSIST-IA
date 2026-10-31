import { pool } from "../db/pool.js";
import { iniciarLlamadaIA } from "./llamadas-ia.js";

/**
 * Cola de salida de las llamadas de IA que NO son de campaña (pedidas por API o lanzadas por flujos). Antes cada
 * solicitud originaba su llamada al instante: una ráfaga de 300 solicitudes del CRM abría 300 llamadas a la vez y
 * saturaba la central / el troncal. Ahora toda llamada se registra en `llamadas_programadas` y el despachador la saca
 * respetando:
 *   - un TOPE de llamadas simultáneas (compartido con las campañas),
 *   - un máximo de llamadas nuevas por ciclo,
 *   - el horario permitido de la empresa (si lo configuró),
 *   - el orden de llegada.
 * Una solicitud suelta, con la línea libre, sale de inmediato (el endpoint lo intenta al instante).
 */

/** Tope de llamadas de IA salientes en el aire a la vez (API + flujos + campañas). */
export function limiteSimultaneas(): number {
  return Number(process.env.LLAMADAS_IA_MAX_SIMULTANEAS ?? process.env.CAMPANAS_MAX_SIMULTANEAS ?? 10);
}

/** Máximo de llamadas nuevas que se originan por ciclo del despachador. */
const LOTE_MAX = Number(process.env.LLAMADAS_IA_LOTE_POR_TICK ?? process.env.FLUJOS_LOTE_POR_TICK ?? 5);

/** Una llamada que no reporta su fin en este tiempo deja de contarse como "en el aire" (callback perdido). */
const MINUTOS_EN_AIRE = 30;

/**
 * Condición SQL (alias `e` = empresas): ahora mismo es hora permitida para llamar. Sin horario configurado, siempre.
 * El horario se evalúa en la zona de la empresa (por defecto America/Santo_Domingo).
 */
export const SQL_EN_HORARIO = `(
  e.llamadas_ia_hora_desde IS NULL OR e.llamadas_ia_hora_hasta IS NULL OR (
    (now() AT TIME ZONE COALESCE(e.llamadas_ia_zona, 'America/Santo_Domingo'))::time >= e.llamadas_ia_hora_desde
    AND (now() AT TIME ZONE COALESCE(e.llamadas_ia_zona, 'America/Santo_Domingo'))::time < e.llamadas_ia_hora_hasta
    AND (e.llamadas_ia_dias IS NULL
         OR extract(isodow FROM (now() AT TIME ZONE COALESCE(e.llamadas_ia_zona, 'America/Santo_Domingo')))::int = ANY(e.llamadas_ia_dias))
  )
)`;

/** Llamadas de IA salientes que están en el aire ahora: contactos de campaña "llamando" + llamadas de la cola sin terminar. */
export async function llamadasIAEnAire(): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT (SELECT COUNT(*) FROM campana_contactos WHERE estado = 'llamando')
          + (SELECT COUNT(*) FROM llamadas_programadas
             WHERE estado = 'completada' AND call_sid IS NOT NULL AND terminada_en IS NULL
               AND enviada_en > now() - ($1 || ' minutes')::interval) AS n`,
    [String(MINUTOS_EN_AIRE)]
  );
  return Number(r.rows[0].n);
}

export async function encolarLlamadaIA(opts: {
  empresaId: string;
  numero: string;
  fecha?: Date;
  llamadaWebhookId?: string | null;
  flujoId?: string | null;
  contactoId?: string | null;
}): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO llamadas_programadas (empresa_id, flujo_id, contacto_id, numero, fecha_programada, llamada_webhook_id)
     VALUES ($1, $2, $3, $4, COALESCE($5, now()), $6) RETURNING id`,
    [opts.empresaId, opts.flujoId ?? null, opts.contactoId ?? null, opts.numero, opts.fecha ?? null, opts.llamadaWebhookId ?? null]
  );
  return r.rows[0].id;
}

let despachando: Promise<number> | null = null;

/**
 * Saca de la cola las llamadas que toca originar ahora. Las que no caben (tope de simultáneas) o están fuera de horario
 * esperan al siguiente ciclo. Devuelve cuántas originó. Las ejecuciones no se solapan.
 */
export async function despacharColaIA(): Promise<number> {
  while (despachando) await despachando.catch(() => 0);
  despachando = despacharInterno().finally(() => {
    despachando = null;
  });
  return despachando;
}

async function despacharInterno(): Promise<number> {
  const cupo = limiteSimultaneas() - (await llamadasIAEnAire());
  if (cupo <= 0) return 0;

  // "Tomar" es atómico (FOR UPDATE SKIP LOCKED + estado en el mismo UPDATE): dos ciclos nunca originan la misma fila.
  const tomadas = await pool.query<{
    id: string;
    empresa_id: string;
    numero: string;
    llamada_webhook_id: string | null;
    flujo_id: string | null;
  }>(
    `UPDATE llamadas_programadas p SET estado = 'completada', enviada_en = now()
     WHERE p.id IN (
       SELECT p2.id FROM llamadas_programadas p2
       JOIN empresas e ON e.id = p2.empresa_id
       WHERE p2.estado = 'pendiente' AND p2.fecha_programada <= now() AND ${SQL_EN_HORARIO}
       ORDER BY p2.fecha_programada, p2.creado_en
       LIMIT $1
       FOR UPDATE OF p2 SKIP LOCKED
     )
     RETURNING p.id, p.empresa_id, p.numero, p.llamada_webhook_id, p.flujo_id`,
    [Math.min(LOTE_MAX, cupo)]
  );

  let originadas = 0;
  for (const fila of tomadas.rows) {
    try {
      const { callSid } = await iniciarLlamadaIA({
        empresaId: fila.empresa_id,
        numero: fila.numero,
        origen: fila.llamada_webhook_id ? "api" : fila.flujo_id ? `flujo:${fila.flujo_id}` : "flujo",
        llamadaWebhookId: fila.llamada_webhook_id ?? undefined,
      });
      await pool.query("UPDATE llamadas_programadas SET call_sid = $2 WHERE id = $1", [fila.id, callSid]);
      // "Registros API" enlaza cada solicitud con su llamada (así se ve la grabación desde ahí).
      if (fila.llamada_webhook_id) {
        await pool
          .query(
            `UPDATE webhooks_recibidos SET call_sid = $2
             WHERE id = (SELECT recibido_id FROM llamadas_webhook WHERE id = $1) AND call_sid IS NULL`,
            [fila.llamada_webhook_id, callSid]
          )
          .catch(() => {});
      }
      originadas++;
    } catch (err) {
      console.error(`[cola-salida-ia ${fila.id}] error originando la llamada:`, err);
      await pool.query(
        "UPDATE llamadas_programadas SET estado = 'fallida', error = $2, terminada_en = now() WHERE id = $1",
        [fila.id, String(err)]
      );
    }
  }
  return originadas;
}

/** Marca terminada una llamada de la cola (la llama el callback de estado de Twilio). */
export async function marcarTerminadaEnCola(callSid: string): Promise<void> {
  await pool.query("UPDATE llamadas_programadas SET terminada_en = now() WHERE call_sid = $1 AND terminada_en IS NULL", [callSid]);
}

export interface EstadoCola {
  limite: number;
  en_aire: number;
  pendientes: number;
  pendientes_fuera_de_horario: number;
  proxima: string | null;
  enviadas_hoy: number;
  fallidas_hoy: number;
  horario: { desde: string | null; hasta: string | null; dias: number[] | null; zona: string };
  en_horario: boolean;
}

export async function estadoCola(empresaId: string): Promise<EstadoCola> {
  const [aire, pend, hoy, horario] = await Promise.all([
    llamadasIAEnAire(),
    pool.query<{ n: string; fuera: string; proxima: string | null }>(
      `SELECT COUNT(*) AS n,
              COUNT(*) FILTER (WHERE NOT ${SQL_EN_HORARIO}) AS fuera,
              MIN(p.fecha_programada)::text AS proxima
       FROM llamadas_programadas p JOIN empresas e ON e.id = p.empresa_id
       WHERE p.empresa_id = $1 AND p.estado = 'pendiente'`,
      [empresaId]
    ),
    pool.query<{ enviadas: string; fallidas: string }>(
      `SELECT COUNT(*) FILTER (WHERE estado = 'completada') AS enviadas, COUNT(*) FILTER (WHERE estado = 'fallida') AS fallidas
       FROM llamadas_programadas
       WHERE empresa_id = $1 AND creado_en >= date_trunc('day', now() AT TIME ZONE 'America/Santo_Domingo')`,
      [empresaId]
    ),
    pool.query<{ desde: string | null; hasta: string | null; dias: number[] | null; zona: string | null; en_horario: boolean }>(
      `SELECT to_char(e.llamadas_ia_hora_desde, 'HH24:MI') AS desde, to_char(e.llamadas_ia_hora_hasta, 'HH24:MI') AS hasta,
              e.llamadas_ia_dias AS dias, e.llamadas_ia_zona AS zona, ${SQL_EN_HORARIO} AS en_horario
       FROM empresas e WHERE e.id = $1`,
      [empresaId]
    ),
  ]);
  const h = horario.rows[0];
  return {
    limite: limiteSimultaneas(),
    en_aire: aire,
    pendientes: Number(pend.rows[0].n),
    pendientes_fuera_de_horario: Number(pend.rows[0].fuera),
    proxima: pend.rows[0].proxima,
    enviadas_hoy: Number(hoy.rows[0].enviadas),
    fallidas_hoy: Number(hoy.rows[0].fallidas),
    horario: { desde: h?.desde ?? null, hasta: h?.hasta ?? null, dias: h?.dias ?? null, zona: h?.zona ?? "America/Santo_Domingo" },
    en_horario: h?.en_horario ?? true,
  };
}

/** Cancela las llamadas que siguen esperando en la cola (no toca las que ya salieron). */
export async function vaciarCola(empresaId: string): Promise<number> {
  const r = await pool.query(
    "UPDATE llamadas_programadas SET estado = 'cancelada' WHERE empresa_id = $1 AND estado = 'pendiente' RETURNING id",
    [empresaId]
  );
  return r.rowCount ?? 0;
}
