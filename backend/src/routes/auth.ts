import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";

/**
 * Login por usuario del dashboard (distinto del PIN de agentes del
 * softphone): email + contraseña, con rol (admin | operador). Es la base
 * para saber "quién" hizo cada cambio en el registro de auditoría.
 */
export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { empresaId: string; email: string; password: string } }>(
    "/api/auth/login",
    async (req, reply) => {
      const { empresaId, email, password } = req.body;
      if (!empresaId || !email || !password) {
        reply.code(400).send({ error: "empresaId, email y password son requeridos" });
        return;
      }

      const result = await pool.query<{
        id: string;
        nombre: string;
        rol: string;
        password_hash: string | null;
        cola_id: string | null;
      }>(
        "SELECT id, nombre, rol, password_hash, cola_id FROM usuarios WHERE empresa_id = $1 AND email = $2",
        [empresaId, email.trim().toLowerCase()]
      );
      const usuario = result.rows[0];

      if (!usuario?.password_hash || !(await bcrypt.compare(password, usuario.password_hash))) {
        reply.code(401).send({ error: "Email o contraseña inválidos" });
        return;
      }

      reply.send({ usuarioId: usuario.id, nombre: usuario.nombre, rol: usuario.rol, colaId: usuario.cola_id });
    }
  );
}
