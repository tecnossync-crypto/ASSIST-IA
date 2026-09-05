import { pool } from "../db/pool.js";

export interface AgenteSesion {
  id: string;
  nombre: string;
  rol: string;
}

/** Identidad del agente dentro de Twilio Voice SDK (un Device por usuario). */
export function identidadAgente(usuarioId: string): string {
  return `agente-${usuarioId}`;
}

/** Extrae el usuarioId de una identidad "agente-<uuid>" (o null si no aplica). */
export function usuarioIdDesdeIdentidad(identidad: string): string | null {
  return identidad.startsWith("agente-") ? identidad.slice("agente-".length) : null;
}

/** Login liviano del ejecutable de escritorio: empresa + PIN corto. */
export async function loginConPin(empresaId: string, pin: string): Promise<AgenteSesion | null> {
  const result = await pool.query<AgenteSesion>(
    "SELECT id, nombre, rol FROM usuarios WHERE empresa_id = $1 AND pin = $2",
    [empresaId, pin]
  );
  return result.rows[0] ?? null;
}

/** El ejecutable llama esto al conectarse/desconectarse (o al cambiar su switch de disponible). */
export async function marcarDisponibilidad(usuarioId: string, disponible: boolean): Promise<void> {
  await pool.query(
    "UPDATE usuarios SET disponible = $2, ultima_conexion = now() WHERE id = $1",
    [usuarioId, disponible]
  );
}

export type ModoEnrutamiento = "todos" | "round_robin" | "disponibilidad" | "menos_llamadas" | "ultimo_operador";
export const MODOS_ENRUTAMIENTO: ModoEnrutamiento[] = [
  "todos",
  "round_robin",
  "disponibilidad",
  "menos_llamadas",
  "ultimo_operador",
];

interface Enrutamiento {
  modo: ModoEnrutamiento;
  turno_actual?: number;
}

/**
 * Decide a qué agente(s) marcar cuando entra una "llamada normal". Twilio
 * permite varios <Client> dentro de un mismo <Dial>: suenan todos a la vez y
 * el primero que conteste se la queda (los demás se cancelan solos) — eso
 * cubre el modo "todos" con una sola llamada a esta función.
 *
 * Si se pasa `colaId`, solo se consideran los agentes de esa cola y se usa
 * el modo de reparto propio de la cola; si no, se considera la empresa
 * completa con su modo general (compatibilidad con llamadas sin cola).
 */
export async function elegirAgentesParaLlamada(empresaId: string, colaId?: string | null): Promise<string[]> {
  const enrutamiento = colaId
    ? await obtenerEnrutamientoCola(empresaId, colaId)
    : await obtenerEnrutamientoEmpresa(empresaId);

  const condicionCola = colaId ? "AND cola_id = $2" : "";
  const params = colaId ? [empresaId, colaId] : [empresaId];
  const disponibles = await pool.query<{ id: string }>(
    `SELECT id FROM usuarios WHERE empresa_id = $1 AND disponible = true ${condicionCola} ORDER BY ultima_conexion ASC`,
    params
  );

  // Fallback: mientras ningún agente se haya marcado disponible en esa cola,
  // se sigue timbrando en el softphone genérico del dashboard web (misma
  // identidad que usa hoy) para no dejar la línea muerta.
  if (disponibles.rows.length === 0) return [`operador-${empresaId}`];

  if (enrutamiento.modo === "disponibilidad") {
    return [identidadAgente(disponibles.rows[0].id)];
  }

  if (enrutamiento.modo === "round_robin") {
    const turno = enrutamiento.turno_actual ?? 0;
    const idx = turno % disponibles.rows.length;
    await avanzarTurno(empresaId, colaId, idx + 1);
    return [identidadAgente(disponibles.rows[idx].id)];
  }

  if (enrutamiento.modo === "menos_llamadas") {
    const idsDisponibles = disponibles.rows.map((r) => r.id);
    const conteo = await pool.query<{ agente_usuario_id: string; total: string }>(
      `SELECT agente_usuario_id, COUNT(*) AS total
       FROM llamadas
       WHERE agente_usuario_id = ANY($1) AND iniciada_en >= date_trunc('day', now())
       GROUP BY agente_usuario_id`,
      [idsDisponibles]
    );
    const llamadasPorAgente = new Map(conteo.rows.map((r) => [r.agente_usuario_id, Number(r.total)]));
    const menosOcupado = idsDisponibles.reduce((menor, actual) =>
      (llamadasPorAgente.get(actual) ?? 0) < (llamadasPorAgente.get(menor) ?? 0) ? actual : menor
    );
    return [identidadAgente(menosOcupado)];
  }

  if (enrutamiento.modo === "ultimo_operador") {
    const idsDisponibles = disponibles.rows.map((r) => r.id);
    const ultimo = await pool.query<{ agente_usuario_id: string }>(
      `SELECT agente_usuario_id
       FROM llamadas
       WHERE agente_usuario_id = ANY($1)
       ORDER BY iniciada_en DESC
       LIMIT 1`,
      [idsDisponibles]
    );
    // Si nadie de los disponibles ha atendido una llamada todavía, se cae al
    // primero disponible (mismo criterio que "disponibilidad").
    const elegido = ultimo.rows[0]?.agente_usuario_id ?? idsDisponibles[0];
    return [identidadAgente(elegido)];
  }

  // "todos" (default)
  return disponibles.rows.map((r) => identidadAgente(r.id));
}

async function obtenerEnrutamientoEmpresa(empresaId: string): Promise<Enrutamiento> {
  const result = await pool.query<{ enrutamiento_llamadas: Enrutamiento }>(
    "SELECT enrutamiento_llamadas FROM empresas WHERE id = $1",
    [empresaId]
  );
  return result.rows[0]?.enrutamiento_llamadas ?? { modo: "todos" };
}

async function obtenerEnrutamientoCola(empresaId: string, colaId: string): Promise<Enrutamiento> {
  const result = await pool.query<{ enrutamiento: Enrutamiento }>(
    "SELECT enrutamiento FROM colas WHERE id = $1 AND empresa_id = $2",
    [colaId, empresaId]
  );
  return result.rows[0]?.enrutamiento ?? { modo: "todos" };
}

async function avanzarTurno(empresaId: string, colaId: string | null | undefined, siguienteTurno: number) {
  if (colaId) {
    await pool.query(
      `UPDATE colas SET enrutamiento = jsonb_set(enrutamiento, '{turno_actual}', to_jsonb($2::int))
       WHERE id = $1`,
      [colaId, siguienteTurno]
    );
  } else {
    await pool.query(
      `UPDATE empresas SET enrutamiento_llamadas = jsonb_set(enrutamiento_llamadas, '{turno_actual}', to_jsonb($2::int))
       WHERE id = $1`,
      [empresaId, siguienteTurno]
    );
  }
}
