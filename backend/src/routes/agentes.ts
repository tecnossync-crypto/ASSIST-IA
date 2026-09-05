import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { loginConPin, marcarDisponibilidad } from "../lib/agentes.js";

/**
 * Agentes del softphone web (dashboard): alta/gestión desde Configuración →
 * Agentes, asignación a una cola, y login liviano + presencia desde el
 * propio softphone del navegador. Fase 1: PIN corto en vez de
 * usuario/contraseña — login completo llega después, junto con auth real
 * del resto de /api.
 */
export async function agentesRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/agentes", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const result = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.pin, u.disponible, u.ultima_conexion,
              u.cola_id, c.nombre AS cola_nombre
       FROM usuarios u
       LEFT JOIN colas c ON c.id = u.cola_id
       WHERE u.empresa_id = $1 ORDER BY u.creado_en`,
      [empresaId]
    );
    reply.send({ agentes: result.rows });
  });

  app.post<{
    Body: { empresaId: string; nombre: string; email: string; pin: string; rol?: string; colaId?: string | null };
  }>("/api/agentes", async (req, reply) => {
    const { empresaId, nombre, email, pin, rol, colaId } = req.body;
    if (!empresaId || !nombre || !email || !pin) {
      reply.code(400).send({ error: "empresaId, nombre, email y pin son requeridos" });
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      reply.code(400).send({ error: "El PIN debe ser numérico, de 4 a 6 dígitos" });
      return;
    }

    try {
      const result = await pool.query(
        `INSERT INTO usuarios (empresa_id, nombre, email, pin, rol, cola_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, nombre, email, rol, pin, cola_id`,
        [empresaId, nombre, email, pin, rol ?? "operador", colaId || null]
      );
      reply.send({ ok: true, agente: result.rows[0] });
    } catch (err) {
      reply.code(409).send({ error: "Ya existe un agente con ese email o PIN en esta empresa", detalle: String(err) });
    }
  });

  app.put<{ Params: { id: string }; Body: { nombre?: string; pin?: string; rol?: string; colaId?: string | null } }>(
    "/api/agentes/:id",
    async (req, reply) => {
      const { id } = req.params;
      const { nombre, pin, rol, colaId } = req.body;
      if (pin && !/^\d{4,6}$/.test(pin)) {
        reply.code(400).send({ error: "El PIN debe ser numérico, de 4 a 6 dígitos" });
        return;
      }

      const result = await pool.query(
        `UPDATE usuarios SET
           nombre = COALESCE($2, nombre),
           pin = COALESCE($3, pin),
           rol = COALESCE($4, rol),
           cola_id = CASE WHEN $5::boolean THEN $6::uuid ELSE cola_id END
         WHERE id = $1
         RETURNING id, nombre, email, rol, pin, cola_id`,
        [id, nombre ?? null, pin ?? null, rol ?? null, colaId !== undefined, colaId || null]
      );
      if (result.rows.length === 0) {
        reply.code(404).send({ error: "no encontrado" });
        return;
      }
      reply.send({ ok: true, agente: result.rows[0] });
    }
  );

  app.delete<{ Params: { id: string } }>("/api/agentes/:id", async (req, reply) => {
    const { id } = req.params;
    await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
    reply.send({ ok: true });
  });

  app.post<{ Body: { empresaId: string; pin: string } }>(
    "/api/agentes/login",
    // PIN corto (4-6 dígitos) es fácil de fuerza-bruta sin esto.
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { empresaId, pin } = req.body;
      if (!empresaId || !pin) {
        reply.code(400).send({ error: "empresaId y pin son requeridos" });
        return;
      }

      const agente = await loginConPin(empresaId, pin);
      if (!agente) {
        reply.code(401).send({ error: "PIN inválido" });
        return;
      }

      reply.send({ usuarioId: agente.id, nombre: agente.nombre, rol: agente.rol });
    }
  );

  // El ejecutable llama esto al conectarse (disponible=true), al desconectarse
  // o cuando el agente cambia su switch de disponibilidad manualmente.
  app.post<{ Body: { usuarioId: string; disponible: boolean } }>("/api/agentes/presencia", async (req, reply) => {
    const { usuarioId, disponible } = req.body;
    if (!usuarioId || typeof disponible !== "boolean") {
      reply.code(400).send({ error: "usuarioId y disponible son requeridos" });
      return;
    }

    await marcarDisponibilidad(usuarioId, disponible);
    reply.send({ ok: true });
  });
}
