import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { clonarVoz } from "../lib/elevenlabs.js";

/**
 * Configuración editable por la propia empresa desde el dashboard: nombre,
 * guion del agente (prompt personalizado o campos guiados), voz del TTS,
 * límites del gestor de llamadas, campos personalizados a recolectar,
 * catálogo de etiquetas y números de transferencia. Fase 1: sin
 * autenticación todavía — mismo TODO que llamadas.ts, no exponer fuera de
 * localhost sin resolver login primero.
 */
export async function empresaRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/empresa", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const result = await pool.query(
      `SELECT id, nombre, guion_agente, numeros_transferencia, voz_agente, tts_provider, campos_personalizados,
              etiquetas_disponibles, duracion_maxima_llamada_segundos, timeout_timbrado_segundos,
              tiempo_respuesta_segundos, enrutamiento_llamadas, retencion_grabaciones_dias
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
      tts_provider?: string | null;
      campos_personalizados?: {
        nombre: string;
        descripcion?: string;
        tipo?: "texto" | "fecha" | "dropdown";
        opciones?: string[];
      }[];
      etiquetas_disponibles?: { nombre: string; color?: string }[];
      duracion_maxima_llamada_segundos?: number;
      timeout_timbrado_segundos?: number;
      tiempo_respuesta_segundos?: number;
    };
  }>("/api/empresa", async (req, reply) => {
    const {
      empresaId,
      nombre,
      guion_agente,
      numeros_transferencia,
      voz_agente,
      tts_provider,
      campos_personalizados,
      etiquetas_disponibles,
      duracion_maxima_llamada_segundos,
      timeout_timbrado_segundos,
      tiempo_respuesta_segundos,
    } = req.body;

    if (!empresaId || !nombre) {
      reply.code(400).send({ error: "empresaId y nombre son requeridos" });
      return;
    }

    const result = await pool.query(
      `UPDATE empresas
       SET nombre = $2, guion_agente = $3, numeros_transferencia = $4,
           voz_agente = $5, campos_personalizados = $6, etiquetas_disponibles = $7,
           duracion_maxima_llamada_segundos = $8, timeout_timbrado_segundos = $9,
           tiempo_respuesta_segundos = $10, tts_provider = $11
       WHERE id = $1
       RETURNING id`,
      [
        empresaId,
        nombre,
        JSON.stringify(guion_agente ?? {}),
        JSON.stringify(numeros_transferencia ?? []),
        voz_agente || null,
        JSON.stringify(campos_personalizados ?? []),
        JSON.stringify(etiquetas_disponibles ?? []),
        duracion_maxima_llamada_segundos ?? 600,
        timeout_timbrado_segundos ?? 30,
        tiempo_respuesta_segundos ?? 0,
        tts_provider || null,
      ]
    );

    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }

    reply.send({ ok: true });
  });

  // Cómo repartir las "llamadas normales" entre los agentes del ejecutable
  // de call center: todos a la vez | round_robin | por disponibilidad.
  app.put<{ Body: { empresaId: string; modo: "todos" | "round_robin" | "disponibilidad" } }>(
    "/api/empresa/enrutamiento",
    async (req, reply) => {
      const { empresaId, modo } = req.body;
      if (!empresaId || !["todos", "round_robin", "disponibilidad"].includes(modo)) {
        reply.code(400).send({ error: "empresaId y un modo válido son requeridos" });
        return;
      }

      const result = await pool.query(
        `UPDATE empresas SET enrutamiento_llamadas = jsonb_set(enrutamiento_llamadas, '{modo}', to_jsonb($2::text))
         WHERE id = $1 RETURNING id`,
        [empresaId, modo]
      );
      if (result.rows.length === 0) {
        reply.code(404).send({ error: "no encontrada" });
        return;
      }

      reply.send({ ok: true });
    }
  );

  // Cuántos días se conserva el audio de las grabaciones antes de que la
  // limpieza automática lo borre (ver jobs/limpiar-grabaciones.ts).
  app.put<{ Body: { empresaId: string; dias: number } }>(
    "/api/empresa/retencion-grabaciones",
    async (req, reply) => {
      const { empresaId, dias } = req.body;
      if (!empresaId || !Number.isInteger(dias) || dias < 1) {
        reply.code(400).send({ error: "empresaId y un número de días válido (mínimo 1) son requeridos" });
        return;
      }

      const result = await pool.query(
        `UPDATE empresas SET retencion_grabaciones_dias = $2 WHERE id = $1 RETURNING id`,
        [empresaId, dias]
      );
      if (result.rows.length === 0) {
        reply.code(404).send({ error: "no encontrada" });
        return;
      }

      reply.send({ ok: true });
    }
  );

  // Clonación de voz: la empresa sube un audio (1-5 min recomendado por
  // ElevenLabs) y se crea una voz clonada lista para usarse en las
  // llamadas. Actualiza voz_agente/tts_provider automáticamente al terminar.
  app.post("/api/empresa/clonar-voz", async (req, reply) => {
    const partes = req.parts();
    let empresaId: string | undefined;
    let nombreVoz: string | undefined;
    let archivo: { buffer: Buffer; filename: string } | undefined;

    for await (const parte of partes) {
      if (parte.type === "field") {
        if (parte.fieldname === "empresaId") empresaId = String(parte.value);
        if (parte.fieldname === "nombreVoz") nombreVoz = String(parte.value);
      } else if (parte.fieldname === "audio") {
        archivo = { buffer: await parte.toBuffer(), filename: parte.filename };
      }
    }

    if (!empresaId || !nombreVoz || !archivo) {
      reply.code(400).send({ error: "empresaId, nombreVoz y audio son requeridos" });
      return;
    }

    try {
      const { voiceId } = await clonarVoz(empresaId, nombreVoz, archivo.buffer, archivo.filename);

      await pool.query(
        `UPDATE empresas SET voz_agente = $2, tts_provider = 'elevenlabs' WHERE id = $1`,
        [empresaId, voiceId]
      );

      reply.send({ ok: true, voiceId });
    } catch (err) {
      app.log.error({ err }, "Error clonando voz con ElevenLabs");
      reply.code(502).send({ error: err instanceof Error ? err.message : "Error desconocido" });
    }
  });
}
