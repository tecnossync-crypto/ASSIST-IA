import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { loginConPin, marcarDisponibilidad, marcarEstadoPresencia, type EstadoPresencia } from "../lib/agentes.js";
import { RANGOS_FECHA, rangoFechaValido } from "../lib/rangos-fecha.js";

const ESTADOS_PRESENCIA_VALIDOS: EstadoPresencia[] = ["disponible", "descanso", "desconectado"];

/** Roles válidos de un usuario: admin (todo), supervisor (todo excepto
 *  Configuración) y operador (agente, solo su cola + softphone). */
const ROLES_VALIDOS = ["admin", "supervisor", "operador"];

/**
 * Agentes/usuarios del dashboard: alta/gestión desde Configuración →
 * Agentes, asignación a una cola, y login liviano + presencia desde el
 * propio softphone del navegador. Un usuario puede tener PIN (softphone),
 * contraseña (login completo al dashboard), o ambos.
 */
export async function agentesRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/agentes", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    const result = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.pin, u.disponible, u.estado_presencia, u.ultima_conexion,
              u.cola_id, c.nombre AS cola_nombre, (u.password_hash IS NOT NULL) AS tiene_acceso_dashboard
       FROM usuarios u
       LEFT JOIN colas c ON c.id = u.cola_id
       WHERE u.empresa_id = $1 ORDER BY u.creado_en`,
      [empresaId]
    );
    reply.send({ agentes: result.rows });
  });

  // Estado propio de un usuario (nombre + estado de presencia actual) — lo
  // usa el botón de estado del dashboard (arriba a la derecha).
  app.get<{ Params: { id: string } }>("/api/agentes/:id", async (req, reply) => {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT id, nombre, email, rol, disponible, estado_presencia FROM usuarios WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrado" });
      return;
    }
    reply.send({ agente: result.rows[0] });
  });

  app.post<{
    Body: {
      empresaId: string;
      nombre: string;
      email: string;
      pin?: string;
      password?: string;
      rol?: string;
      colaId?: string | null;
    };
  }>("/api/agentes", async (req, reply) => {
    const { empresaId, nombre, email, pin, password, rol, colaId } = req.body;
    if (!empresaId || !nombre || !email) {
      reply.code(400).send({ error: "empresaId, nombre y email son requeridos" });
      return;
    }
    if (!pin && !password) {
      reply.code(400).send({ error: "El usuario necesita un PIN (softphone), una contraseña (dashboard), o ambos" });
      return;
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      reply.code(400).send({ error: "El PIN debe ser numérico, de 4 a 6 dígitos" });
      return;
    }
    const rolFinal = rol && ROLES_VALIDOS.includes(rol) ? rol : "operador";

    try {
      const passwordHash = password ? await bcrypt.hash(password, 10) : null;
      const result = await pool.query(
        `INSERT INTO usuarios (empresa_id, nombre, email, pin, password_hash, rol, cola_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, nombre, email, rol, pin, cola_id`,
        [empresaId, nombre, email.trim().toLowerCase(), pin || null, passwordHash, rolFinal, colaId || null]
      );
      reply.send({ ok: true, agente: result.rows[0] });
    } catch (err) {
      reply.code(409).send({ error: "Ya existe un agente con ese email o PIN en esta empresa", detalle: String(err) });
    }
  });

  app.put<{
    Params: { id: string };
    Body: { nombre?: string; email?: string; pin?: string; rol?: string; colaId?: string | null; password?: string };
  }>("/api/agentes/:id", async (req, reply) => {
    const { id } = req.params;
    const { nombre, email, pin, rol, colaId, password } = req.body;
    if (pin && !/^\d{4,6}$/.test(pin)) {
      reply.code(400).send({ error: "El PIN debe ser numérico, de 4 a 6 dígitos" });
      return;
    }
    if (rol && !ROLES_VALIDOS.includes(rol)) {
      reply.code(400).send({ error: "Rol inválido" });
      return;
    }
    if (password && password.length < 8) {
      reply.code(400).send({ error: "La contraseña debe tener al menos 8 caracteres" });
      return;
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    try {
      const result = await pool.query(
        `UPDATE usuarios SET
           nombre = COALESCE($2, nombre),
           email = COALESCE($3, email),
           pin = COALESCE($4, pin),
           rol = COALESCE($5, rol),
           cola_id = CASE WHEN $6::boolean THEN $7::uuid ELSE cola_id END,
           password_hash = COALESCE($8, password_hash)
         WHERE id = $1
         RETURNING id, nombre, email, rol, pin, cola_id`,
        [
          id,
          nombre ?? null,
          email ? email.trim().toLowerCase() : null,
          pin ?? null,
          rol ?? null,
          colaId !== undefined,
          colaId || null,
          passwordHash,
        ]
      );
      if (result.rows.length === 0) {
        reply.code(404).send({ error: "no encontrado" });
        return;
      }
      reply.send({ ok: true, agente: result.rows[0] });
    } catch (err) {
      reply.code(409).send({ error: "Ya existe otro usuario con ese email o PIN en esta empresa", detalle: String(err) });
    }
  });

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

  // "Tiempo de línea activo" por agente en el intervalo elegido — cuánto
  // tiempo estuvo conectado (disponible o en descanso) cada usuario, y si
  // sigue conectado ahora mismo. Suma el solapamiento de cada sesión de
  // usuarios_conexiones con el rango pedido (incluida la sesión abierta, si
  // el rango llega hasta "ahora").
  app.get<{ Querystring: { empresaId?: string; rango?: string } }>(
    "/api/agentes/tiempo-conectado",
    async (req, reply) => {
      const { empresaId } = req.query;
      if (!empresaId) {
        reply.code(400).send({ error: "empresaId es requerido" });
        return;
      }
      const rango = rangoFechaValido(req.query.rango);
      const { desdeSQL, hastaSQL } = RANGOS_FECHA[rango];

      const result = await pool.query(
        `SELECT u.id, u.nombre, u.rol,
                (u.estado_presencia <> 'desconectado') AS conectado_ahora,
                COALESCE(SUM(
                  GREATEST(0, EXTRACT(EPOCH FROM (
                    LEAST(COALESCE(c.desconectado_en, now()), ${hastaSQL}) -
                    GREATEST(c.conectado_en, ${desdeSQL})
                  )))
                ), 0)::bigint AS segundos_conectado
         FROM usuarios u
         LEFT JOIN usuarios_conexiones c
           ON c.usuario_id = u.id
           AND c.conectado_en < ${hastaSQL}
           AND COALESCE(c.desconectado_en, now()) > ${desdeSQL}
         WHERE u.empresa_id = $1
         GROUP BY u.id, u.nombre, u.rol, u.estado_presencia
         ORDER BY u.nombre`,
        [empresaId]
      );

      reply.send({ rango, agentes: result.rows });
    }
  );

  // El ejecutable/softphone llama esto al conectarse (disponible=true) o al
  // desconectarse (disponible=false). El botón de estado del dashboard llama
  // esto mismo pero con `estado` (disponible | descanso | desconectado) para
  // poder distinguir "en pausa" de "desconectado del todo".
  app.post<{ Body: { usuarioId: string; disponible?: boolean; estado?: EstadoPresencia } }>(
    "/api/agentes/presencia",
    async (req, reply) => {
      const { usuarioId, disponible, estado } = req.body;
      if (!usuarioId) {
        reply.code(400).send({ error: "usuarioId es requerido" });
        return;
      }

      if (estado !== undefined) {
        if (!ESTADOS_PRESENCIA_VALIDOS.includes(estado)) {
          reply.code(400).send({ error: "estado inválido" });
          return;
        }
        await marcarEstadoPresencia(usuarioId, estado);
      } else if (typeof disponible === "boolean") {
        await marcarDisponibilidad(usuarioId, disponible);
      } else {
        reply.code(400).send({ error: "disponible o estado son requeridos" });
        return;
      }

      reply.send({ ok: true });
    }
  );
}
