-- Roles y permisos configurables. `usuarios.rol` sigue guardando la clave del rol (texto libre):
-- admin | supervisor | operador son los roles del sistema; cualquier otra clave es un rol propio de la empresa.
--   permisos: { resumen, llamadas, contactos, contactos_editar, contactos_eliminar, campanas,
--               supervision, intervenir, configuracion, registros_api, roles }  (ver lib/roles.ts)
CREATE TABLE IF NOT EXISTS roles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    clave        TEXT NOT NULL,
    nombre       TEXT NOT NULL,
    descripcion  TEXT,
    permisos     JSONB NOT NULL DEFAULT '{}'::jsonb,
    sistema      BOOLEAN NOT NULL DEFAULT false,
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, clave)
);
CREATE INDEX IF NOT EXISTS idx_roles_empresa ON roles(empresa_id);
