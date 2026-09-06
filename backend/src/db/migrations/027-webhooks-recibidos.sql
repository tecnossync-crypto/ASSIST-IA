-- Bitácora de cada request que llega a los webhooks públicos (llamar-agente,
-- llamadas con IA, actualizar contacto) — para que desde Configuración →
-- Integraciones se pueda ver EXACTAMENTE qué mandó la plataforma de
-- terceros (o una prueba manual desde el propio dashboard) antes de dar por
-- buena la integración.
CREATE TABLE IF NOT EXISTS webhooks_recibidos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL, -- 'llamar-agente' | 'llamadas' | 'contactos'
    body        JSONB NOT NULL DEFAULT '{}'::jsonb,
    ok          BOOLEAN NOT NULL,
    error       TEXT,
    es_prueba   BOOLEAN NOT NULL DEFAULT false, -- disparada desde "Probar" del dashboard, no una plataforma real
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_recibidos_empresa ON webhooks_recibidos(empresa_id, creado_en DESC);
