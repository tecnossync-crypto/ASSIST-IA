import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { coincideRegla } from "../lib/reglas-api-llamadas.js";

const OPERADORES_VALIDOS = ["igual", "contiene", "existe"];

const MAX_RETRASO_MINUTOS = 90 * 24 * 60; // 90 días, igual que el POST del webhook

/** "HH:MM" 24 h y zona IANA válida, o error. */
function leerHoraDelDia(hora: unknown, zona: unknown): { hora: string | null; zona: string | null; error?: string } {
  if (hora === undefined || hora === null || hora === "") return { hora: null, zona: null };
  if (typeof hora !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return { hora: null, zona: null, error: "La hora debe tener formato HH:MM (24 horas)." };
  }
  const z = typeof zona === "string" && zona ? zona : "America/Santo_Domingo";
  try {
    new Intl.DateTimeFormat("es", { timeZone: z });
  } catch {
    return { hora: null, zona: null, error: "La zona horaria no es válida." };
  }
  return { hora, zona: z };
}

/** Valida el horario opcional de una regla: espera en minutos y/o fecha fija ISO con zona. */
function leerHorario(
  retraso: unknown,
  fecha: unknown
): { retraso: number | null; fecha: Date | null; error?: string } {
  let r: number | null = null;
  if (retraso !== undefined && retraso !== null && retraso !== "") {
    const n = Math.floor(Number(retraso));
    if (!Number.isFinite(n) || n < 0 || n > MAX_RETRASO_MINUTOS) {
      return { retraso: null, fecha: null, error: "La espera debe ser de 0 a 90 días." };
    }
    r = n > 0 ? n : null;
  }
  let f: Date | null = null;
  if (fecha !== undefined && fecha !== null && fecha !== "") {
    const d = new Date(String(fecha));
    if (Number.isNaN(d.getTime())) return { retraso: null, fecha: null, error: "La fecha y hora no son válidas." };
    f = d;
  }
  return { retraso: r, fecha: f };
}

/**
 * Reglas que deciden QUÉ GUION usar cuando llega una solicitud al webhook
 * público /api/webhooks/llamadas, según los campos que mande la plataforma
 * externa — en vez de confiar ciegamente en el texto libre que manda esa
 * plataforma como "prompt" (ver evaluarReglaApiLlamadas en
 * lib/reglas-api-llamadas.ts, usado desde webhooks-externos.ts).
 */
export async function reglasApiRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/reglas-api-llamadas", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }
    const result = await pool.query(
      `SELECT id, nombre, campo, operador, valor, prompt_personalizado, activa, orden, retraso_minutos, fecha_programada,
              to_char(hora_del_dia, 'HH24:MI') AS hora_del_dia, zona_horaria, creado_en
       FROM reglas_api_llamadas WHERE empresa_id = $1 ORDER BY orden, creado_en`,
      [empresaId]
    );
    reply.send({ reglas: result.rows });
  });

  app.post<{
    Body: {
      empresaId: string;
      nombre: string;
      campo: string;
      operador?: string;
      valor: string;
      promptPersonalizado: string;
      orden?: number;
      retrasoMinutos?: number | null;
      fechaProgramada?: string | null;
      horaDelDia?: string | null;
      zonaHoraria?: string | null;
    };
  }>("/api/reglas-api-llamadas", async (req, reply) => {
    const { empresaId, nombre, campo, operador, valor, promptPersonalizado, orden } = req.body;
    const horario = leerHorario(req.body.retrasoMinutos, req.body.fechaProgramada);
    if (horario.error) {
      reply.code(400).send({ error: horario.error });
      return;
    }
    const diaria = leerHoraDelDia(req.body.horaDelDia, req.body.zonaHoraria);
    if (diaria.error) {
      reply.code(400).send({ error: diaria.error });
      return;
    }
    const operadorFinal = operador && OPERADORES_VALIDOS.includes(operador) ? operador : "igual";
    if (
      !empresaId ||
      !nombre?.trim() ||
      !campo?.trim() ||
      (operadorFinal !== "existe" && !valor?.trim()) ||
      !promptPersonalizado?.trim()
    ) {
      reply.code(400).send({ error: "nombre, campo, valor y promptPersonalizado son requeridos" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO reglas_api_llamadas
         (empresa_id, nombre, campo, operador, valor, prompt_personalizado, orden, retraso_minutos, fecha_programada,
          hora_del_dia, zona_horaria)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, nombre, campo, operador, valor, prompt_personalizado, activa, orden, retraso_minutos, fecha_programada,
                 to_char(hora_del_dia, 'HH24:MI') AS hora_del_dia, zona_horaria`,
      [empresaId, nombre.trim(), campo.trim(), operadorFinal, (valor ?? "").trim(), promptPersonalizado.trim(), orden ?? 0, horario.retraso, horario.fecha, diaria.hora, diaria.zona]
    );
    reply.send({ ok: true, regla: result.rows[0] });
  });

  app.put<{
    Params: { id: string };
    Querystring: { empresaId?: string };
    Body: {
      nombre?: string;
      campo?: string;
      operador?: string;
      valor?: string;
      promptPersonalizado?: string;
      activa?: boolean;
      orden?: number;
    };
  }>("/api/reglas-api-llamadas/:id", async (req, reply) => {
    const { id } = req.params;
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }
    const { nombre, campo, operador, valor, promptPersonalizado, activa, orden } = req.body;
    if (operador && !OPERADORES_VALIDOS.includes(operador)) {
      reply.code(400).send({ error: "operador inválido" });
      return;
    }

    const result = await pool.query(
      `UPDATE reglas_api_llamadas SET
         nombre = COALESCE($2, nombre),
         campo = COALESCE($3, campo),
         operador = COALESCE($4, operador),
         valor = COALESCE($5, valor),
         prompt_personalizado = COALESCE($6, prompt_personalizado),
         activa = COALESCE($7, activa),
         orden = COALESCE($8, orden)
       WHERE id = $1 AND empresa_id = $9
       RETURNING id, nombre, campo, operador, valor, prompt_personalizado, activa, orden`,
      [id, nombre ?? null, campo ?? null, operador ?? null, valor ?? null, promptPersonalizado ?? null, activa ?? null, orden ?? null, empresaId]
    );
    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }
    reply.send({ ok: true, regla: result.rows[0] });
  });

  app.delete<{ Params: { id: string }; Querystring: { empresaId?: string } }>(
    "/api/reglas-api-llamadas/:id",
    async (req, reply) => {
      const { empresaId } = req.query;
      if (!empresaId) {
        reply.code(400).send({ error: "empresaId es requerido" });
        return;
      }
      await pool.query("DELETE FROM reglas_api_llamadas WHERE id = $1 AND empresa_id = $2", [req.params.id, empresaId]);
      reply.send({ ok: true });
    }
  );

  // Simulador: dado un body de ejemplo (el que mandaría la plataforma externa),
  // dice qué regla aplicaría — sin llamar a nadie. Evalúa TODAS las reglas
  // (también las inactivas, marcadas) para ver por qué una no dispara.
  app.post<{ Body: { empresaId?: string; payload?: unknown } }>("/api/reglas-api-llamadas/probar", async (req, reply) => {
    const { empresaId, payload } = req.body ?? {};
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      reply.code(400).send({ error: "payload debe ser un objeto JSON" });
      return;
    }
    const reglas = await pool.query<{
      id: string;
      nombre: string;
      campo: string;
      operador: string;
      valor: string;
      activa: boolean;
    }>(
      `SELECT id, nombre, campo, operador, valor, activa
       FROM reglas_api_llamadas WHERE empresa_id = $1 ORDER BY orden, creado_en`,
      [empresaId]
    );
    const evaluadas = reglas.rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      activa: r.activa,
      coincide: coincideRegla(r, payload as Record<string, unknown>),
    }));
    const aplicada = evaluadas.find((r) => r.activa && r.coincide) ?? null;
    reply.send({ aplicada: aplicada ? { id: aplicada.id, nombre: aplicada.nombre } : null, evaluadas });
  });
}
