import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { loginConPin, marcarDisponibilidad, marcarEstadoPresencia, type EstadoPresencia } from "../lib/agentes.js";
import { RANGOS_FECHA, rangoFechaValido } from "../lib/rangos-fecha.js";
import { subirArchivo, streamArchivo, eliminarArchivo } from "../lib/storage.js";
import {
  generarSecretoTotp,
  encriptarSecretoTotp,
  generarQrTotp,
  verificarCodigoTotp,
  generarCodigosRespaldo,
} from "../lib/dos-fa.js";

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
      `SELECT u.id, u.nombre, u.email, u.telefono, u.rol, u.pin, u.disponible, u.estado_presencia, u.ultima_conexion,
              u.cola_id, c.nombre AS cola_nombre, (u.password_hash IS NOT NULL) AS tiene_acceso_dashboard,
              (u.avatar_key IS NOT NULL) AS tiene_avatar, u.totp_habilitado, u.id_externo
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
      `SELECT id, nombre, email, telefono, rol, disponible, estado_presencia,
              (avatar_key IS NOT NULL) AS tiene_avatar, totp_habilitado
       FROM usuarios WHERE id = $1`,
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
      telefono?: string;
      idExterno?: string;
      pin?: string;
      password?: string;
      rol?: string;
      colaId?: string | null;
    };
  }>("/api/agentes", async (req, reply) => {
    const { empresaId, nombre, email, telefono, idExterno, pin, password, rol, colaId } = req.body;
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
        `INSERT INTO usuarios (empresa_id, nombre, email, telefono, id_externo, pin, password_hash, rol, cola_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, nombre, email, telefono, id_externo, rol, pin, cola_id`,
        [
          empresaId,
          nombre,
          email.trim().toLowerCase(),
          telefono?.trim() || null,
          idExterno?.trim() || null,
          pin || null,
          passwordHash,
          rolFinal,
          colaId || null,
        ]
      );
      reply.send({ ok: true, agente: result.rows[0] });
    } catch (err) {
      reply.code(409).send({ error: "Ya existe un agente con ese email o PIN en esta empresa", detalle: String(err) });
    }
  });

  app.put<{
    Params: { id: string };
    Body: {
      nombre?: string;
      email?: string;
      telefono?: string;
      idExterno?: string;
      pin?: string;
      rol?: string;
      colaId?: string | null;
      password?: string;
    };
  }>("/api/agentes/:id", async (req, reply) => {
    const { id } = req.params;
    const { nombre, email, telefono, idExterno, pin, rol, colaId, password } = req.body;
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
           password_hash = COALESCE($8, password_hash),
           telefono = COALESCE($9, telefono),
           id_externo = CASE WHEN $10::boolean THEN $11 ELSE id_externo END
         WHERE id = $1
         RETURNING id, nombre, email, telefono, id_externo, rol, pin, cola_id`,
        [
          id,
          nombre ?? null,
          email ? email.trim().toLowerCase() : null,
          pin ?? null,
          rol ?? null,
          colaId !== undefined,
          colaId || null,
          passwordHash,
          telefono !== undefined ? telefono.trim() || null : null,
          idExterno !== undefined,
          idExterno?.trim() || null,
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
    const previo = await pool.query<{ avatar_key: string | null }>("SELECT avatar_key FROM usuarios WHERE id = $1", [id]);
    await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
    if (previo.rows[0]?.avatar_key) {
      await eliminarArchivo(previo.rows[0].avatar_key).catch((err) =>
        app.log.warn({ err, id }, "No se pudo borrar el avatar del usuario eliminado (no bloquea la eliminación)")
      );
    }
    reply.send({ ok: true });
  });

  // ── Foto de perfil ──────────────────────────────────────────────────
  const TIPOS_IMAGEN_VALIDOS = new Set(["image/jpeg", "image/png", "image/webp"]);

  app.post<{ Params: { id: string } }>("/api/agentes/:id/avatar", async (req, reply) => {
    const { id } = req.params;
    const data = await req.file();
    if (!data) {
      reply.code(400).send({ error: "No se recibió ningún archivo" });
      return;
    }
    if (!TIPOS_IMAGEN_VALIDOS.has(data.mimetype)) {
      reply.code(400).send({ error: "Formato no soportado — usa JPG, PNG o WEBP" });
      return;
    }

    const buffer = await data.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) {
      reply.code(400).send({ error: "La imagen no puede pesar más de 5 MB" });
      return;
    }

    const extension = data.mimetype === "image/png" ? "png" : data.mimetype === "image/webp" ? "webp" : "jpg";
    const key = `avatares/${id}-${Date.now()}.${extension}`;

    const previo = await pool.query<{ avatar_key: string | null }>("SELECT avatar_key FROM usuarios WHERE id = $1", [id]);
    if (previo.rows.length === 0) {
      reply.code(404).send({ error: "no encontrado" });
      return;
    }

    try {
      await subirArchivo({ key, body: buffer, contentType: data.mimetype });
    } catch (err) {
      app.log.error({ err }, "Error subiendo avatar");
      reply.code(502).send({ error: "No se pudo subir la imagen — revisa la configuración de STORAGE_*" });
      return;
    }

    await pool.query("UPDATE usuarios SET avatar_key = $2 WHERE id = $1", [id, key]);

    if (previo.rows[0].avatar_key) {
      await eliminarArchivo(previo.rows[0].avatar_key).catch((err) =>
        app.log.warn({ err, id }, "No se pudo borrar el avatar anterior (no bloquea la subida del nuevo)")
      );
    }

    reply.send({ ok: true });
  });

  app.get<{ Params: { id: string } }>("/api/agentes/:id/avatar", async (req, reply) => {
    const { id } = req.params;
    const result = await pool.query<{ avatar_key: string | null }>("SELECT avatar_key FROM usuarios WHERE id = $1", [id]);
    const key = result.rows[0]?.avatar_key;
    if (!key) {
      reply.code(404).send();
      return;
    }
    try {
      const { body, contentType } = await streamArchivo(key);
      reply
        .header("content-type", contentType ?? "image/jpeg")
        .header("cache-control", "private, max-age=300")
        .send(body);
    } catch (err) {
      app.log.error({ err, id }, "Error sirviendo avatar");
      reply.code(502).send();
    }
  });

  app.delete<{ Params: { id: string } }>("/api/agentes/:id/avatar", async (req, reply) => {
    const { id } = req.params;
    const result = await pool.query<{ avatar_key: string | null }>("SELECT avatar_key FROM usuarios WHERE id = $1", [id]);
    const key = result.rows[0]?.avatar_key;
    if (key) {
      await eliminarArchivo(key).catch((err) => app.log.warn({ err, id }, "No se pudo borrar el avatar del storage"));
    }
    await pool.query("UPDATE usuarios SET avatar_key = NULL WHERE id = $1", [id]);
    reply.send({ ok: true });
  });

  // ── Autenticación de dos pasos (app autenticadora, TOTP) ────────────
  // 1. iniciar: genera el secreto (aún no activo) + QR para escanear.
  // 2. confirmar: valida un código real de la app antes de activar de
  //    verdad — así nunca queda un 2FA "a medias" que bloquee el login si
  //    el usuario escaneó mal el QR.
  // 3. desactivar: apaga 2FA (requiere la contraseña actual, ver body).
  app.post<{ Params: { id: string } }>("/api/agentes/:id/2fa/iniciar", async (req, reply) => {
    const { id } = req.params;
    const usuario = await pool.query<{ email: string; totp_habilitado: boolean }>(
      "SELECT email, totp_habilitado FROM usuarios WHERE id = $1",
      [id]
    );
    if (usuario.rows.length === 0) {
      reply.code(404).send({ error: "no encontrado" });
      return;
    }
    if (usuario.rows[0].totp_habilitado) {
      reply.code(400).send({ error: "Este usuario ya tiene 2FA activo — desactívalo antes de generar uno nuevo" });
      return;
    }

    const secreto = generarSecretoTotp();
    const { qrDataUrl } = await generarQrTotp(secreto, usuario.rows[0].email);
    await pool.query("UPDATE usuarios SET totp_secret_enc = $2 WHERE id = $1", [id, encriptarSecretoTotp(secreto)]);

    // La clave en texto (base32) se manda una sola vez para que el usuario
    // pueda escribirla a mano si no puede escanear el QR — no se vuelve a
    // exponer después de esto.
    reply.send({ qrDataUrl, claveManual: secreto });
  });

  app.post<{ Params: { id: string }; Body: { codigo: string } }>(
    "/api/agentes/:id/2fa/confirmar",
    // Código de 6 dígitos = 1 millón de combinaciones — sin límite, se
    // puede intentar fuerza bruta directo (a diferencia de /verificar-2fa
    // del login, este no exige la contraseña primero). Mismo límite que el
    // resto de los endpoints sensibles a fuerza bruta de la plataforma.
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { id } = req.params;
      const { codigo } = req.body;
      if (!codigo) {
        reply.code(400).send({ error: "codigo es requerido" });
        return;
      }

      const usuario = await pool.query<{ totp_secret_enc: string | null }>(
        "SELECT totp_secret_enc FROM usuarios WHERE id = $1",
        [id]
      );
      const secretoEnc = usuario.rows[0]?.totp_secret_enc;
      if (!secretoEnc) {
        reply.code(400).send({ error: "Primero genera el código QR con /2fa/iniciar" });
        return;
      }
      if (!verificarCodigoTotp(secretoEnc, codigo)) {
        reply.code(401).send({ error: "Código incorrecto — revisa la hora de tu teléfono e intenta de nuevo" });
        return;
      }

      const { codigos, hashes } = await generarCodigosRespaldo();
      await pool.query("UPDATE usuarios SET totp_habilitado = true, totp_codigos_respaldo = $2 WHERE id = $1", [
        id,
        hashes,
      ]);

      reply.send({ ok: true, codigosRespaldo: codigos });
    }
  );

  app.post<{ Params: { id: string } }>("/api/agentes/:id/2fa/desactivar", async (req, reply) => {
    const { id } = req.params;
    await pool.query(
      "UPDATE usuarios SET totp_habilitado = false, totp_secret_enc = NULL, totp_codigos_respaldo = '{}' WHERE id = $1",
      [id]
    );
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
