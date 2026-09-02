-- Incremental: voz configurable + campos personalizados de recolección.
-- Idempotente (IF NOT EXISTS) para poder correr contra una base que ya
-- tiene el schema base de la Fase 0/1.

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS voz_agente TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS campos_personalizados JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS datos_llamada (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    llamada_id  UUID NOT NULL REFERENCES llamadas(id) ON DELETE CASCADE,
    campo       TEXT NOT NULL,
    valor       TEXT NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_datos_llamada_llamada ON datos_llamada(llamada_id);
