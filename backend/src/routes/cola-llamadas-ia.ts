import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { estadoCola, vaciarCola } from "../lib/cola-salida-ia.js";

/** "HH:MM" 24 h o null. */
function leerHora(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined;
}

export async function colaLlamadasIARoutes(app: FastifyInstance): Promise<void> {
  // Estado de la cola de salida (envío masivo): capacidad, en el aire, pendientes y horario permitido.
  app.get<{ Querystring: { empresaId?: string } }>("/api/llamadas-ia/cola", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) return reply.code(400).send({ error: "empresaId es requerido" });
    return estadoCola(empresaId);
  });

  // Horario en que se permiten las llamadas de IA automáticas. desde/hasta null = sin restricción.
  app.put<{
    Body: { empresaId?: string; desde?: string | null; hasta?: string | null; dias?: number[] | null; zona?: string | null };
  }>("/api/llamadas-ia/horario", async (req, reply) => {
    const { empresaId, dias, zona } = req.body ?? {};
    if (!empresaId) return reply.code(400).send({ error: "empresaId es requerido" });
    const desde = leerHora(req.body?.desde);
    const hasta = leerHora(req.body?.hasta);
    if (desde === undefined || hasta === undefined) return reply.code(400).send({ error: "Las horas deben tener formato HH:MM (24 horas)." });
    if ((desde === null) !== (hasta === null)) return reply.code(400).send({ error: "Indica la hora de inicio y la de fin, o deja ambas vacías." });
    if (desde && hasta && desde >= hasta) return reply.code(400).send({ error: "La hora de fin debe ser posterior a la de inicio." });
    let diasOk: number[] | null = null;
    if (Array.isArray(dias) && dias.length > 0) {
      diasOk = [...new Set(dias.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort();
      if (diasOk.length === 0) return reply.code(400).send({ error: "Los días deben ir de 1 (lunes) a 7 (domingo)." });
      if (diasOk.length === 7) diasOk = null;
    }
    const z = zona || "America/Santo_Domingo";
    try {
      new Intl.DateTimeFormat("es", { timeZone: z });
    } catch {
      return reply.code(400).send({ error: "La zona horaria no es válida." });
    }
    await pool.query(
      `UPDATE empresas SET llamadas_ia_hora_desde = $2, llamadas_ia_hora_hasta = $3, llamadas_ia_dias = $4, llamadas_ia_zona = $5 WHERE id = $1`,
      [empresaId, desde, hasta, diasOk, desde ? z : null]
    );
    return estadoCola(empresaId);
  });

  // Cancela las llamadas que siguen esperando en la cola.
  app.post<{ Body: { empresaId?: string } }>("/api/llamadas-ia/cola/vaciar", async (req, reply) => {
    const empresaId = req.body?.empresaId;
    if (!empresaId) return reply.code(400).send({ error: "empresaId es requerido" });
    return { canceladas: await vaciarCola(empresaId) };
  });
}
