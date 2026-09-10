import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

const OPERADORES_VALIDOS = ["igual", "contiene"];

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
      `SELECT id, nombre, campo, operador, valor, prompt_personalizado, activa, orden, creado_en
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
    };
  }>("/api/reglas-api-llamadas", async (req, reply) => {
    const { empresaId, nombre, campo, operador, valor, promptPersonalizado, orden } = req.body;
    if (!empresaId || !nombre?.trim() || !campo?.trim() || !valor?.trim() || !promptPersonalizado?.trim()) {
      reply.code(400).send({ error: "nombre, campo, valor y promptPersonalizado son requeridos" });
      return;
    }
    const operadorFinal = operador && OPERADORES_VALIDOS.includes(operador) ? operador : "igual";

    const result = await pool.query(
      `INSERT INTO reglas_api_llamadas (empresa_id, nombre, campo, operador, valor, prompt_personalizado, orden)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, nombre, campo, operador, valor, prompt_personalizado, activa, orden`,
      [empresaId, nombre.trim(), campo.trim(), operadorFinal, valor.trim(), promptPersonalizado.trim(), orden ?? 0]
    );
    reply.send({ ok: true, regla: result.rows[0] });
  });

  app.put<{
    Params: { id: string };
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
       WHERE id = $1
       RETURNING id, nombre, campo, operador, valor, prompt_personalizado, activa, orden`,
      [id, nombre ?? null, campo ?? null, operador ?? null, valor ?? null, promptPersonalizado ?? null, activa ?? null, orden ?? null]
    );
    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }
    reply.send({ ok: true, regla: result.rows[0] });
  });

  app.delete<{ Params: { id: string } }>("/api/reglas-api-llamadas/:id", async (req, reply) => {
    await pool.query("DELETE FROM reglas_api_llamadas WHERE id = $1", [req.params.id]);
    reply.send({ ok: true });
  });
}
