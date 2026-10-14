import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { asegurarRolesSistema, normalizarPermisos, slugRol } from "../lib/roles.js";

/** Roles y permisos (Configuración → Roles y permisos). Los roles del sistema no se borran ni se renombran. */
export async function rolesRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string } }>("/api/roles", async (req, reply) => {
    const { empresaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }
    await asegurarRolesSistema(empresaId);
    const r = await pool.query(
      `SELECT r.id, r.clave, r.nombre, r.descripcion, r.permisos, r.sistema,
              (SELECT COUNT(*)::int FROM usuarios u WHERE u.empresa_id = r.empresa_id AND u.rol = r.clave) AS usuarios
       FROM roles r WHERE r.empresa_id = $1
       ORDER BY r.sistema DESC, CASE r.clave WHEN 'admin' THEN 0 WHEN 'supervisor' THEN 1 WHEN 'operador' THEN 2 ELSE 3 END, r.creado_en`,
      [empresaId]
    );
    reply.send({ roles: r.rows.map((x) => ({ ...x, permisos: normalizarPermisos(x.permisos) })) });
  });

  app.post<{
    Body: { empresaId: string; nombre: string; descripcion?: string; permisos?: unknown };
  }>("/api/roles", async (req, reply) => {
    const { empresaId, nombre, descripcion, permisos } = req.body;
    const nombreLimpio = (nombre ?? "").trim();
    if (!empresaId || !nombreLimpio) {
      reply.code(400).send({ error: "El nombre del rol es requerido" });
      return;
    }
    const base = slugRol(nombreLimpio) || "rol";
    let clave = base;
    for (let i = 2; i < 50; i++) {
      const existe = await pool.query("SELECT 1 FROM roles WHERE empresa_id = $1 AND clave = $2", [empresaId, clave]);
      if (existe.rows.length === 0) break;
      clave = `${base}-${i}`;
    }
    const r = await pool.query(
      `INSERT INTO roles (empresa_id, clave, nombre, descripcion, permisos, sistema)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING id, clave`,
      [empresaId, clave, nombreLimpio.slice(0, 60), descripcion?.trim().slice(0, 200) || null, JSON.stringify(normalizarPermisos(permisos))]
    );
    reply.send({ ok: true, rol: r.rows[0] });
  });

  app.put<{
    Params: { id: string };
    Body: { empresaId: string; nombre?: string; descripcion?: string; permisos?: unknown };
  }>("/api/roles/:id", async (req, reply) => {
    const { id } = req.params;
    const { empresaId, nombre, descripcion, permisos } = req.body;
    const actual = await pool.query<{ clave: string; sistema: boolean }>(
      "SELECT clave, sistema FROM roles WHERE id = $1 AND empresa_id = $2",
      [id, empresaId]
    );
    const rol = actual.rows[0];
    if (!rol) {
      reply.code(404).send({ error: "Rol no encontrado" });
      return;
    }
    if (rol.clave === "admin") {
      reply.code(400).send({ error: "El rol Administrador siempre tiene acceso total y no se puede modificar." });
      return;
    }
    // Los roles del sistema conservan su nombre; sí se les pueden ajustar los permisos.
    const nuevoNombre = !rol.sistema && nombre?.trim() ? nombre.trim().slice(0, 60) : null;
    await pool.query(
      `UPDATE roles SET
         nombre = COALESCE($3, nombre),
         descripcion = CASE WHEN $4::boolean THEN $5 ELSE descripcion END,
         permisos = CASE WHEN $6::boolean THEN $7::jsonb ELSE permisos END
       WHERE id = $1 AND empresa_id = $2`,
      [
        id,
        empresaId,
        nuevoNombre,
        descripcion !== undefined,
        descripcion?.trim().slice(0, 200) || null,
        permisos !== undefined,
        JSON.stringify(normalizarPermisos(permisos)),
      ]
    );
    reply.send({ ok: true });
  });

  app.delete<{ Params: { id: string }; Querystring: { empresaId?: string } }>("/api/roles/:id", async (req, reply) => {
    const { id } = req.params;
    const { empresaId } = req.query;
    const actual = await pool.query<{ clave: string; sistema: boolean }>(
      "SELECT clave, sistema FROM roles WHERE id = $1 AND empresa_id = $2",
      [id, empresaId]
    );
    const rol = actual.rows[0];
    if (!rol) {
      reply.code(404).send({ error: "Rol no encontrado" });
      return;
    }
    if (rol.sistema) {
      reply.code(400).send({ error: "Los roles del sistema no se pueden eliminar." });
      return;
    }
    const enUso = await pool.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM usuarios WHERE empresa_id = $1 AND rol = $2",
      [empresaId, rol.clave]
    );
    if (enUso.rows[0].n > 0) {
      reply.code(409).send({
        error: `Hay ${enUso.rows[0].n} usuario(s) con este rol. Cámbiales el rol antes de eliminarlo.`,
      });
      return;
    }
    await pool.query("DELETE FROM roles WHERE id = $1 AND empresa_id = $2", [id, empresaId]);
    reply.send({ ok: true });
  });
}
