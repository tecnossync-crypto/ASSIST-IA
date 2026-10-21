import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "./twilio-empresa.js";
import { identidadAgente, SQL_ASESOR_LIBRE } from "./agentes.js";
import { destinoDeTransferencia } from "./enrutamiento.js";

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
    `SELECT COUNT(*) AS n FROM usuarios u
     WHERE u.empresa_id = $1 AND u.disponible = true ${colaId ? "AND u.cola_id = $2" : ""} AND ${SQL_ASESOR_LIBRE}`,
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
/**
 * Un asesor cierra una llamada desde su panel: el cliente no contesta (buzón de voz) o ya no hay nadie. Se cuelga la
 * llamada del cliente y se cancelan las piernas de asesores que sigan timbrando. Queda anotada como "sin contacto"
 * (en una campaña se reintenta).
 */
export async function cerrarLlamada(empresaId: string, llamadaId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await pool.query<{ call_sid: string; agentes_call_sids: string[] }>(
    `SELECT call_sid, agentes_call_sids FROM llamadas WHERE id = $1 AND empresa_id = $2 AND finalizada_en IS NULL`,
    [llamadaId, empresaId]
  );
  const llamada = r.rows[0];
  if (!llamada) return { ok: false, error: "La llamada ya terminó." };

  await pool.query(
    `UPDATE llamadas SET resultado_automatico = COALESCE(resultado_automatico, 'sin_contacto'),
            en_cola_desde = NULL, respaldo_central_en = NULL, asignada_a = NULL, asignada_en = NULL
     WHERE id = $1`,
    [llamadaId]
  );

  const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
  if (!twilioEmpresa) return { ok: false, error: "La empresa no tiene credenciales Twilio configuradas." };
  await Promise.all(
    [llamada.call_sid, ...(llamada.agentes_call_sids ?? [])].map((sid) =>
      twilioEmpresa.client
        .calls(sid)
        .update({ status: "completed" })
        .catch(() => {}) // ya estaba colgada
    )
  );
  return { ok: true };
}

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

/**
 * Timbra a un asesor con una llamada de la cola (sin conectarlo a la fuerza: le suena y él contesta).
 * El "claim" es atómico: la misma llamada no se timbra a dos asesores a la vez.
 */
async function timbrarAsesorParaCola(
  llamadaId: string,
  empresaId: string,
  usuarioId: string,
  publicBaseUrl: string
): Promise<boolean> {
  const liberar = () =>
    pool.query("UPDATE llamadas SET asignada_a = NULL, asignada_en = NULL WHERE id = $1", [llamadaId]).catch(() => {});

  const claim = await pool.query<{
    conferencia_nombre: string | null;
    agentes_call_sids: string[];
    direccion: string;
    numero_origen: string;
    numero_destino: string;
  }>(
    `UPDATE llamadas SET asignada_a = $3, asignada_en = now()
     WHERE id = $1 AND empresa_id = $2 AND en_cola_desde IS NOT NULL AND agente_call_sid IS NULL
       AND (asignada_en IS NULL OR asignada_en < now() - interval '45 seconds')
     RETURNING conferencia_nombre, agentes_call_sids, direccion, numero_origen, numero_destino`,
    [llamadaId, empresaId, usuarioId]
  );
  const fila = claim.rows[0];
  if (!fila) return false;

  const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
  if (!twilioEmpresa || !fila.conferencia_nombre) {
    await liberar();
    return false;
  }

  // Cancela los timbres anteriores de esta llamada (otro asesor al que ya no se le insiste).
  await Promise.all(
    (fila.agentes_call_sids ?? []).map((sid) =>
      twilioEmpresa.client
        .calls(sid)
        .update({ status: "completed" })
        .catch(() => {})
    )
  );

  const identidad = identidadAgente(usuarioId);
  const params = new URLSearchParams({
    llamadaId,
    numero: fila.direccion === "entrante" ? fila.numero_origen : fila.numero_destino,
  });
  try {
    const call = await twilioEmpresa.client.calls.create({
      to: `client:${identidad}?${params.toString()}`,
      from: twilioEmpresa.fromNumber,
      url: `${publicBaseUrl}/webhooks/twilio/conferencia-agente?conferencia=${encodeURIComponent(fila.conferencia_nombre)}`,
      method: "POST",
      timeout: twilioEmpresa.timeoutTimbrado,
    });
    await pool.query("UPDATE llamadas SET agentes_call_sids = $2, agentes_call_sids_identidad = $3 WHERE id = $1", [
      llamadaId,
      [call.sid],
      JSON.stringify({ [call.sid]: identidad }),
    ]);
    return true;
  } catch (err) {
    console.error("[cola-espera] no se pudo timbrar al asesor libre:", err);
    await liberar();
    return false;
  }
}

let asignandoCola = false;

/**
 * Cola automática: si hay clientes esperando y un asesor queda libre (terminó su llamada o se puso Activo),
 * se le timbra el cliente que lleva más tiempo, sin que tenga que ir a la pestaña "Cola". Si no contesta,
 * se prueba con otro asesor libre (el mismo no se repite durante 3 minutos).
 * Solo aplica a las llamadas que se atienden en la plataforma; las de la central tienen su propia cola.
 * Corre en el despachador (cada 20 s) y justo después de que termina una llamada.
 */
export async function asignarColaAAsesoresLibres(publicBaseUrl: string): Promise<number> {
  if (asignandoCola) return 0;
  asignandoCola = true;
  try {
    const esperando = await pool.query<{
      id: string;
      empresa_id: string;
      cola_id: string | null;
      asignada_a: string | null;
      asignada_en: string | null;
    }>(
      `SELECT id, empresa_id, cola_id, asignada_a, asignada_en FROM llamadas
       WHERE en_cola_desde IS NOT NULL AND agente_call_sid IS NULL AND estado IN ('en_curso', 'transferida')
         AND (asignada_en IS NULL OR asignada_en < now() - interval '45 seconds')
       ORDER BY en_cola_desde ASC
       LIMIT 20`
    );

    let asignadas = 0;
    for (const c of esperando.rows) {
      if ((await destinoDeTransferencia(c.empresa_id, c.cola_id)) !== "plataforma") continue;
      const libre = await pool.query<{ id: string }>(
        `SELECT u.id FROM usuarios u
         WHERE u.empresa_id = $1 AND u.disponible = true
           AND ($2::uuid IS NULL OR u.cola_id = $2::uuid)
           AND ($3::uuid IS NULL OR u.id <> $3::uuid OR $4::timestamptz < now() - interval '3 minutes')
           AND ${SQL_ASESOR_LIBRE}
         ORDER BY u.ultima_conexion ASC
         LIMIT 1`,
        [c.empresa_id, c.cola_id, c.asignada_a, c.asignada_en]
      );
      const asesor = libre.rows[0]?.id;
      if (!asesor) continue;
      if (await timbrarAsesorParaCola(c.id, c.empresa_id, asesor, publicBaseUrl)) asignadas++;
    }
    return asignadas;
  } finally {
    asignandoCola = false;
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
