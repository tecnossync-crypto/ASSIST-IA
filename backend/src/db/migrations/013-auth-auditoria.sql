-- Login real por usuario (email + contraseña) para el dashboard, con roles,
-- y registro de auditoría de cambios en Configuración: qué se cambió,
-- cuándo, y quién lo hizo.

-- password_hash ya existe (nullable, migración 010) — se usa de verdad
-- ahora para el login del dashboard.

CREATE TABLE IF NOT EXISTS auditoria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_nombre  TEXT NOT NULL, -- copiado al momento: sobrevive si se borra el usuario
    accion          TEXT NOT NULL, -- crear | actualizar | eliminar | activar | desactivar
    entidad         TEXT NOT NULL, -- empresa | ia | agente | cola | flujo_trabajo | contactos_config
    detalle         JSONB NOT NULL DEFAULT '{}'::jsonb,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoria(empresa_id, creado_en DESC);
