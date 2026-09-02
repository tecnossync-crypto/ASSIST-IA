import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * CRUD de campañas de llamadas salientes masivas + su lista de contactos.
 * El envío real de llamadas lo hace jobs/dispatcher-campanas.ts, corriendo
 * en segundo plano; estas rutas solo administran el estado en la base.
 * Fase 1: sin auth todavía, mismo TODO que el resto de /api.
 */
export async function campanasRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/campanas", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const result = await pool.query(
      `SELECT
         c.id, c.nombre, c.estado, c.reintentos_max, c.horas_entre_reintentos, c.creado_en, c.programada_para,
         COUNT(cc.*) AS total_contactos,
         COUNT(cc.*) FILTER (WHERE cc.estado = 'completada') AS completados,
         COUNT(cc.*) FILTER (WHERE cc.estado = 'fallida') AS fallidos,
         COUNT(cc.*) FILTER (WHERE cc.estado = 'pendiente') AS pendientes,
         COUNT(cc.*) FILTER (WHERE cc.estado = 'llamando') AS llamando
       FROM campanas c
       LEFT JOIN campana_contactos cc ON cc.campana_id = c.id
       WHERE c.empresa_id = $1
       GROUP BY c.id
       ORDER BY c.creado_en DESC`,
      [empresaId]
    );

    reply.send({ campanas: result.rows });
  });

  app.post<{
    Body: {
      empresaId: string;
      nombre: string;
      contactos: { numero: string; nombre?: string }[];
      reintentosMax?: number;
      horasEntreReintentos?: number;
      guionOverride?: Record<string, unknown> | null;
      programadaPara?: string | null;
    };
  }>("/api/campanas", async (req, reply) => {
    const { empresaId, nombre, contactos, reintentosMax, horasEntreReintentos, guionOverride, programadaPara } =
      req.body;

    if (!empresaId || !nombre || !contactos?.length) {
      reply.code(400).send({ error: "empresaId, nombre y al menos un contacto son requeridos" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const campana = await client.query<{ id: string }>(
        `INSERT INTO campanas (empresa_id, nombre, reintentos_max, horas_entre_reintentos, guion_override, programada_para)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          empresaId,
          nombre,
          reintentosMax ?? 2,
          horasEntreReintentos ?? 4,
          guionOverride ? JSON.stringify(guionOverride) : null,
          programadaPara || null,
        ]
      );
      const campanaId = campana.rows[0].id;

      for (const c of contactos) {
        if (!c.numero) continue;
        await client.query(
          `INSERT INTO campana_contactos (campana_id, empresa_id, numero, nombre) VALUES ($1, $2, $3, $4)`,
          [campanaId, empresaId, c.numero, c.nombre ?? null]
        );
      }

      await client.query("COMMIT");
      reply.send({ ok: true, campanaId });
    } catch (err) {
      await client.query("ROLLBACK");
      app.log.error(err, "Error creando campaña");
      reply.code(500).send({ error: "No se pudo crear la campaña" });
    } finally {
      client.release();
    }
  });

  app.get<{ Params: { id: string } }>("/api/campanas/:id", async (req, reply) => {
    const { id } = req.params;

    const campana = await pool.query(
      `SELECT id, empresa_id, nombre, estado, reintentos_max, horas_entre_reintentos, guion_override, creado_en, programada_para
       FROM campanas WHERE id = $1`,
      [id]
    );
    if (campana.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }

    const contactos = await pool.query(
      `SELECT id, numero, nombre, estado, intentos, ultima_llamada_id, proximo_intento_en, creado_en
       FROM campana_contactos WHERE campana_id = $1 ORDER BY creado_en`,
      [id]
    );

    reply.send({ campana: campana.rows[0], contactos: contactos.rows });
  });

  app.post<{ Params: { id: string } }>("/api/campanas/:id/iniciar", async (req, reply) => {
    const result = await pool.query(
      "UPDATE campanas SET estado = 'en_curso' WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }
    reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>("/api/campanas/:id/pausar", async (req, reply) => {
    const result = await pool.query(
      "UPDATE campanas SET estado = 'pausada' WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }
    reply.send({ ok: true });
  });
}
