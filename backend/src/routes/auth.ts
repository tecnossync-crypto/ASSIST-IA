import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { verificarCodigoTotp, verificarCodigoRespaldo } from "../lib/dos-fa.js";
import { crearDesafio2FA, consumirDesafio2FA } from "../lib/auth-2fa-challenges.js";

/**
 * Login por usuario del dashboard (distinto del PIN de agentes del
 * softphone): email + contraseña, con rol (admin | operador). Es la base
 * para saber "quién" hizo cada cambio en el registro de auditoría.
 *
 * Con 2FA activo (ver /2fa/*), el login es en dos pasos: /login valida la
 * contraseña y, si el usuario tiene 2FA, devuelve un `desafioToken` en vez
 * de la sesión — el dashboard pide el código de la app autenticadora y lo
 * manda a /verificar-2fa, que ahí sí devuelve la sesión.
 */
export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { empresaId: string; email: string; password: string } }>(
    "/api/auth/login",
    // Límite estricto contra fuerza bruta de contraseña.
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
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
        totp_habilitado: boolean;
      }>(
        "SELECT id, nombre, rol, password_hash, cola_id, totp_habilitado FROM usuarios WHERE empresa_id = $1 AND email = $2",
        [empresaId, email.trim().toLowerCase()]
      );
      const usuario = result.rows[0];

      if (!usuario?.password_hash || !(await bcrypt.compare(password, usuario.password_hash))) {
        reply.code(401).send({ error: "Email o contraseña inválidos" });
        return;
      }

      if (usuario.totp_habilitado) {
        const desafioToken = crearDesafio2FA(usuario.id);
        reply.send({ requiere2fa: true, desafioToken });
        return;
      }

      reply.send({ usuarioId: usuario.id, nombre: usuario.nombre, rol: usuario.rol, colaId: usuario.cola_id });
    }
  );

  app.post<{ Body: { desafioToken: string; codigo: string } }>(
    "/api/auth/verificar-2fa",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { desafioToken, codigo } = req.body;
      if (!desafioToken || !codigo) {
        reply.code(400).send({ error: "desafioToken y codigo son requeridos" });
        return;
      }

      const usuarioId = consumirDesafio2FA(desafioToken);
      if (!usuarioId) {
        reply.code(401).send({ error: "El código expiró o ya se usó — vuelve a iniciar sesión." });
        return;
      }

      const result = await pool.query<{
        id: string;
        nombre: string;
        rol: string;
        cola_id: string | null;
        totp_secret_enc: string | null;
        totp_codigos_respaldo: string[];
      }>(
        "SELECT id, nombre, rol, cola_id, totp_secret_enc, totp_codigos_respaldo FROM usuarios WHERE id = $1",
        [usuarioId]
      );
      const usuario = result.rows[0];
      if (!usuario?.totp_secret_enc) {
        reply.code(401).send({ error: "Código inválido" });
        return;
      }

      const codigoLimpio = codigo.trim();
      const esTotp = /^\d{6}$/.test(codigoLimpio) && verificarCodigoTotp(usuario.totp_secret_enc, codigoLimpio);

      if (!esTotp) {
        // No era un código de 6 dígitos válido — probamos como código de
        // respaldo de un solo uso (formato "XXXX-XXXX").
        const indice = await verificarCodigoRespaldo(usuario.totp_codigos_respaldo ?? [], codigoLimpio);
        if (indice === -1) {
          reply.code(401).send({ error: "Código inválido" });
          return;
        }
        const restantes = [...usuario.totp_codigos_respaldo];
        restantes.splice(indice, 1);
        await pool.query("UPDATE usuarios SET totp_codigos_respaldo = $2 WHERE id = $1", [usuarioId, restantes]);
      }

      reply.send({ usuarioId: usuario.id, nombre: usuario.nombre, rol: usuario.rol, colaId: usuario.cola_id });
    }
  );
}
