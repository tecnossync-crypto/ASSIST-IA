-- API key para que plataformas externas puedan pedir llamadas salientes vía
-- webhook (POST /api/webhooks/llamadas), y la tabla donde queda registro de
-- esas solicitudes (número, prompt que mandó la plataforma, y qué llamada
-- terminó originando).
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS llamadas_webhook (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero      TEXT NOT NULL,
    prompt      TEXT, -- instrucciones que mandó la plataforma externa para ESTA llamada; sustituye el prompt normal si viene
    origen      TEXT, -- identificador libre de qué sistema la pidió, para trazabilidad
    call_sid    TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llamadas_webhook_empresa ON llamadas_webhook(empresa_id, creado_en DESC);
