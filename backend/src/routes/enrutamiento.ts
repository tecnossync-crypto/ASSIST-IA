import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

/**
 * Enrutamiento de las llamadas que la IA transfiere: dónde se atienden
 * (plataforma / central / ambos) y qué extensiones de la central suenan.
 * Fase 1: sin auth todavía, mismo TODO que el resto de /api — por eso TODA
 * consulta acá filtra por empresa_id (nunca se opera solo por id).
 */
const DESTINOS = ["plataforma", "central", "ambos"] as const;
type Destino = (typeof DESTINOS)[number];

const NUMERO_EXTENSION = /^[0-9*#]{1,20}$/;

export async function enrutamientoRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/enrutamiento", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const empresa = await pool.query<{ enrutamiento_destino: Destino }>(
      "SELECT enrutamiento_destino FROM empresas WHERE id = $1",
      [empresaId]
    );
    if (empresa.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }

    const extensiones = await pool.query(
      `SELECT e.id, e.numero, e.nombre, e.cola_id, e.activa, c.nombre AS cola_nombre
       FROM extensiones_central e
       LEFT JOIN colas c ON c.id = e.cola_id AND c.empresa_id = e.empresa_id
       WHERE e.empresa_id = $1
       ORDER BY c.nombre NULLS FIRST, e.numero`,
      [empresaId]
    );

    reply.send({ destino: empresa.rows[0].enrutamiento_destino, extensiones: extensiones.rows });
  });

  app.put<{ Body: { empresaId: string; destino: Destino } }>("/api/enrutamiento/destino", async (req, reply) => {
    const { empresaId, destino } = req.body;
    if (!empresaId || !DESTINOS.includes(destino)) {
      reply.code(400).send({ error: "empresaId y un destino válido (plataforma, central o ambos) son requeridos" });
      return;
    }
    await pool.query("UPDATE empresas SET enrutamiento_destino = $2 WHERE id = $1", [empresaId, destino]);
    reply.send({ ok: true });
  });

  // Destino propio de una cola; null = usa el de la empresa.
  app.put<{ Params: { id: string }; Body: { empresaId: string; destino: Destino | null } }>(
    "/api/colas/:id/destino",
    async (req, reply) => {
      const { id } = req.params;
      const { empresaId, destino } = req.body;
      if (!empresaId || (destino !== null && !DESTINOS.includes(destino))) {
        reply.code(400).send({ error: "empresaId y un destino válido (o null) son requeridos" });
        return;
      }
      const result = await pool.query(
        "UPDATE colas SET destino_llamadas = $3 WHERE id = $1 AND empresa_id = $2 RETURNING id",
        [id, empresaId, destino]
      );
      if (result.rows.length === 0) {
        reply.code(404).send({ error: "no encontrada" });
        return;
      }
      reply.send({ ok: true });
    }
  );

  app.post<{ Body: { empresaId: string; numero: string; nombre?: string; colaId?: string | null } }>(
    "/api/extensiones",
    async (req, reply) => {
      const { empresaId, nombre, colaId } = req.body;
      const numero = req.body.numero?.trim();
      if (!empresaId || !numero) {
        reply.code(400).send({ error: "empresaId y numero son requeridos" });
        return;
      }
      if (!NUMERO_EXTENSION.test(numero)) {
        reply.code(400).send({ error: "El número de extensión solo puede llevar dígitos, * o # (máx. 20)" });
        return;
      }
      if (colaId) {
        const cola = await pool.query("SELECT 1 FROM colas WHERE id = $1 AND empresa_id = $2", [colaId, empresaId]);
        if (cola.rows.length === 0) {
          reply.code(400).send({ error: "La cola no existe" });
          return;
        }
      }

      try {
        const result = await pool.query(
          `INSERT INTO extensiones_central (empresa_id, cola_id, numero, nombre)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [empresaId, colaId || null, numero, nombre?.trim() || null]
        );
        reply.send({ ok: true, id: result.rows[0].id });
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          reply.code(409).send({ error: `La extensión ${numero} ya está registrada` });
          return;
        }
        throw err;
      }
    }
  );

  app.put<{
    Params: { id: string };
    Body: { empresaId: string; nombre?: string | null; colaId?: string | null; activa?: boolean };
  }>("/api/extensiones/:id", async (req, reply) => {
    const { id } = req.params;
    const { empresaId, nombre, colaId, activa } = req.body;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }
    if (colaId) {
      const cola = await pool.query("SELECT 1 FROM colas WHERE id = $1 AND empresa_id = $2", [colaId, empresaId]);
      if (cola.rows.length === 0) {
        reply.code(400).send({ error: "La cola no existe" });
        return;
      }
    }

    // colaId viene "" o null para "sin departamento"; undefined = no tocar.
    const cambiaCola = colaId !== undefined;
    const result = await pool.query(
      `UPDATE extensiones_central SET
         nombre = CASE WHEN $3::boolean THEN $4 ELSE nombre END,
         cola_id = CASE WHEN $5::boolean THEN $6::uuid ELSE cola_id END,
         activa = COALESCE($7, activa)
       WHERE id = $1 AND empresa_id = $2
       RETURNING id`,
      [
        id,
        empresaId,
        nombre !== undefined,
        nombre?.trim() || null,
        cambiaCola,
        colaId || null,
        activa ?? null,
      ]
    );
    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrada" });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete<{ Params: { id: string }; Querystring: { empresaId?: string } }>(
    "/api/extensiones/:id",
    async (req, reply) => {
      const { empresaId } = req.query;
      if (!empresaId) {
        reply.code(400).send({ error: "empresaId es requerido" });
        return;
      }
      await pool.query("DELETE FROM extensiones_central WHERE id = $1 AND empresa_id = $2", [
        req.params.id,
        empresaId,
      ]);
      reply.send({ ok: true });
    }
  );
}
