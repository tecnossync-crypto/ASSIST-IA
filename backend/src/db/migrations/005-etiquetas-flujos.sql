-- Etiquetas para organizar contactos + catálogo de etiquetas por empresa,
-- y flujos de trabajo: reglas simples "cuando termina una llamada así,
-- hacer esto" (agregar etiqueta o crear una solicitud de seguimiento).

ALTER TABLE contactos ADD COLUMN IF NOT EXISTS etiquetas TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS etiquetas_disponibles JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS flujos_trabajo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    disparador      TEXT NOT NULL, -- llamada_completada | llamada_no_contesta | llamada_transferida
    accion          TEXT NOT NULL, -- agregar_etiqueta | crear_solicitud
    accion_datos    JSONB NOT NULL DEFAULT '{}'::jsonb, -- {etiqueta} o {tipo, descripcion}
    activo          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flujos_trabajo_empresa ON flujos_trabajo(empresa_id, disparador, activo);
