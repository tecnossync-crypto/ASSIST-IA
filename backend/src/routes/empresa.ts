import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * Configuración editable por la propia empresa desde el dashboard: nombre,
 * guion del agente (prompt personalizado o campos guiados), voz del TTS,
 * campos personalizados a recolectar y números de transferencia. Fase 1:
 * sin autenticación todavía — mismo TODO que llamadas.ts, no exponer fuera
 * de localhost sin resolver login primero.
 */
export async function empresaRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/empresa", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const result = await pool.query(
      `SELECT id, nombre, guion_agente, numeros_transferencia, voz_agente, campos_personalizados
       FROM empresas WHERE id = $1`,
      [empresaId]
    );

    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }

    reply.send(result.rows[0]);
  });

  app.put<{
    Body: {
      empresaId: string;
      nombre: string;
      guion_agente: Record<string, unknown>;
      numeros_transferencia: string[];
      voz_agente?: string | null;
      campos_personalizados?: { nombre: string; descripcion?: string }[];
    };
  }>("/api/empresa", async (req, reply) => {
    const {
      empresaId,
      nombre,
      guion_agente,
      numeros_transferencia,
      voz_agente,
      campos_personalizados,
    } = req.body;

    if (!empresaId || !nombre) {
      reply.code(400).send({ error: "empresaId y nombre son requeridos" });
      return;
    }

    const result = await pool.query(
      `UPDATE empresas
       SET nombre = $2, guion_agente = $3, numeros_transferencia = $4,
           voz_agente = $5, campos_personalizados = $6
       WHERE id = $1
       RETURNING id`,
      [
        empresaId,
        nombre,
        JSON.stringify(guion_agente ?? {}),
        JSON.stringify(numeros_transferencia ?? []),
        voz_agente || null,
        JSON.stringify(campos_personalizados ?? []),
      ]
    );

    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }

    reply.send({ ok: true });
  });
}
