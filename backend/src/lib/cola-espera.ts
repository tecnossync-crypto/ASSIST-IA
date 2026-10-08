import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "./twilio-empresa.js";
import { identidadAgente } from "./agentes.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function colaEsperaConfig(empresaId: string): Promise<{ activa: boolean; maxMinutos: number }> {
  const r = await pool.query<{ activa: boolean; max: number }>(
    "SELECT cola_espera_activa AS activa, cola_espera_max_minutos AS max FROM empresas WHERE id = $1",
    [empresaId]
  );
  return { activa: r.rows[0]?.activa ?? true, maxMinutos: r.rows[0]?.max ?? 10 };
}

/**
 * ¿Hay algún asesor REAL marcado como activo (disponible)? Se mira aparte de
 * elegirAgentesParaLlamada porque esa función, si no hay nadie, devuelve la
 * identidad genérica del softphone "para no dejar la línea muerta" — y eso hacía
 * parecer que siempre había alguien a quien timbrar.
 */
export async function hayAsesoresDisponibles(empresaId: string, colaId?: string | null): Promise<boolean> {
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM usuarios
     WHERE empresa_id = $1 AND disponible = true ${colaId ? "AND cola_id = $2" : ""}`,
    colaId ? [empresaId, colaId] : [empresaId]
  );
  return Number(r.rows[0].n) > 0;
}

/** Marca que el cliente quedó esperando en la conferencia (hasta que un asesor entre o cuelgue). */
export async function marcarEnCola(llamadaId: string, conferenciaNombre: string): Promise<void> {
  await pool.query(
    "UPDATE llamadas SET en_cola_desde = COALESCE(en_cola_desde, now()), conferencia_nombre = $2 WHERE id = $1",
    [llamadaId, conferenciaNombre]
  );
}

export interface LlamadaEnCola {
  id: string;
  numero: string;
  desde: string;
  espera_segundos: number;
  cola_nombre: string | null;
  contacto_nombre: string | null;
  motivo: string | null;
  solicitud: string | null;
}

/**
 * Llamadas esperando ahora mismo. Con colaId (operadores) solo las de su
 * departamento y las que no tienen departamento. Siempre filtra por empresa.
 */
export async function listarColaEspera(empresaId: string, colaId?: string | null): Promise<LlamadaEnCola[]> {
  const cola = colaId && UUID.test(colaId) ? colaId : null;
  const r = await pool.query(
    `SELECT l.id, l.direccion, l.numero_origen, l.numero_destino, l.en_cola_desde,
            EXTRACT(EPOCH FROM (now() - l.en_cola_desde))::int AS espera_segundos,
            c.nombre AS cola_nombre,
            ct.nombre AS contacto_nombre, ct.apellido AS contacto_apellido,
            t.resumen_motivo, t.resumen_solicitud
     FROM llamadas l
     LEFT JOIN colas c ON c.id = l.cola_id AND c.empresa_id = l.empresa_id
     LEFT JOIN contactos ct ON ct.id = l.contacto_id
     LEFT JOIN LATERAL (
       SELECT resumen_motivo, resumen_solicitud FROM transcripciones
       WHERE llamada_id = l.id ORDER BY creado_en DESC LIMIT 1
     ) t ON true
     WHERE l.empresa_id = $1
       AND l.en_cola_desde IS NOT NULL
       AND l.estado IN ('en_curso', 'transferida')
       AND ($2::uuid IS NULL OR l.cola_id IS NULL OR l.cola_id = $2::uuid)
     ORDER BY l.en_cola_desde ASC
     LIMIT 20`,
    [empresaId, cola]
  );

  return r.rows.map((f) => ({
    id: f.id,
    numero: f.direccion === "entrante" ? f.numero_origen : f.numero_destino,
    desde: f.en_cola_desde,
    espera_segundos: Math.max(0, f.espera_segundos ?? 0),
    cola_nombre: f.cola_nombre,
    contacto_nombre: [f.contacto_nombre, f.contacto_apellido].filter(Boolean).join(" ") || null,
    motivo: f.resumen_motivo,
    solicitud: f.resumen_solicitud,
  }));
}

export type ResultadoAtender = { ok: true } | { ok: false; codigo: 404 | 409 | 502 | 400; error: string };

/**
 * Un asesor toma una llamada de la cola: se le timbra su softphone (con
 * autoContestar, para que no tenga que contestar su propio clic) y al entrar a
 * la conferencia queda conectado con el cliente. El "claim" es atómico — si dos
 * asesores pulsan Atender a la vez, solo uno la toma.
 */
export async function atenderDeCola(opts: {
  empresaId: string;
  llamadaId: string;
  usuarioId?: string | null;
  publicBaseUrl: string;
}): Promise<ResultadoAtender> {
  const { empresaId, llamadaId, usuarioId, publicBaseUrl } = opts;
  if (!UUID.test(llamadaId)) return { ok: false, codigo: 400, error: "Llamada inválida." };

  if (usuarioId) {
    if (!UUID.test(usuarioId)) return { ok: false, codigo: 400, error: "Asesor inválido." };
    const u = await pool.query("SELECT 1 FROM usuarios WHERE id = $1 AND empresa_id = $2", [usuarioId, empresaId]);
    if (u.rows.length === 0) return { ok: false, codigo: 404, error: "Asesor no encontrado." };
  }

  // Claim atómico: solo si sigue esperando y nadie la tiene.
  const claim = await pool.query<{ conferencia_nombre: string | null; agentes_call_sids: string[] }>(
    `UPDATE llamadas SET en_cola_desde = NULL
     WHERE id = $1 AND empresa_id = $2 AND en_cola_desde IS NOT NULL AND agente_call_sid IS NULL
     RETURNING conferencia_nombre, agentes_call_sids`,
    [llamadaId, empresaId]
  );
  const fila = claim.rows[0];
  if (!fila) return { ok: false, codigo: 409, error: "Esta llamada ya la tomó otro asesor o el cliente colgó." };

  const devolverACola = () =>
    pool.query("UPDATE llamadas SET en_cola_desde = COALESCE(en_cola_desde, now()) WHERE id = $1", [llamadaId]);

  const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
  if (!twilioEmpresa || !fila.conferencia_nombre) {
    await devolverACola();
    return { ok: false, codigo: 502, error: "No se pudo conectar la llamada (sin credenciales o sin conferencia)." };
  }

  // Cancela los timbres que siguieran sonando a otros asesores.
  await Promise.all(
    (fila.agentes_call_sids ?? []).map((sid) =>
      twilioEmpresa.client
        .calls(sid)
        .update({ status: "completed" })
        .catch(() => {})
    )
  );

  const identidad = usuarioId ? identidadAgente(usuarioId) : `operador-${empresaId}`;
  const agenteUrl = `${publicBaseUrl}/webhooks/twilio/conferencia-agente?conferencia=${encodeURIComponent(fila.conferencia_nombre)}`;
  try {
    const datos = await pool.query<{ direccion: string; numero_origen: string; numero_destino: string }>(
      "SELECT direccion, numero_origen, numero_destino FROM llamadas WHERE id = $1",
      [llamadaId]
    );
    const d = datos.rows[0];
    const params = new URLSearchParams({ llamadaId, autoContestar: "true" });
    if (d) params.set("numero", d.direccion === "entrante" ? d.numero_origen : d.numero_destino);

    const call = await twilioEmpresa.client.calls.create({
      to: `client:${identidad}?${params.toString()}`,
      from: twilioEmpresa.fromNumber,
      url: agenteUrl,
      method: "POST",
      timeout: twilioEmpresa.timeoutTimbrado,
    });
    await pool.query(
      `UPDATE llamadas SET agentes_call_sids = $2, agentes_call_sids_identidad = $3 WHERE id = $1`,
      [llamadaId, [call.sid], JSON.stringify({ [call.sid]: identidad })]
    );
    return { ok: true };
  } catch (err) {
    console.error("[cola-espera] no se pudo timbrar al asesor:", err);
    await devolverACola();
    return { ok: false, codigo: 502, error: "No se pudo conectar con tu teléfono del navegador. ¿Está conectado?" };
  }
}

const DESPEDIDA_TIMEOUT =
  "Lamentamos la espera, en este momento no logramos comunicarlo con un asesor. Por favor, intente de nuevo más tarde. Gracias.";

/**
 * Cuelga (con un aviso) a los clientes que esperaron más del máximo que la
 * empresa configuró. Corre en el despachador, junto a las llamadas programadas.
 */
export async function expirarColaVencida(): Promise<number> {
  const vencidas = await pool.query<{ id: string; empresa_id: string; call_sid: string }>(
    `UPDATE llamadas l SET en_cola_desde = NULL
     FROM empresas e
     WHERE e.id = l.empresa_id
       AND l.en_cola_desde IS NOT NULL
       AND l.en_cola_desde < now() - (e.cola_espera_max_minutos || ' minutes')::interval
     RETURNING l.id, l.empresa_id, l.call_sid`
  );

  for (const v of vencidas.rows) {
    try {
      const twilioEmpresa = await clienteTwilioEmpresa(v.empresa_id);
      await twilioEmpresa?.client.calls(v.call_sid).update({
        twiml: `<Response><Say language="es-MX">${DESPEDIDA_TIMEOUT}</Say><Hangup/></Response>`,
      });
    } catch (err) {
      console.error(`[cola-espera] no se pudo colgar la llamada vencida ${v.call_sid}:`, err);
    }
  }
  return vencidas.rows.length;
}
