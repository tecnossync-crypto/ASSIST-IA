-- Reglas para el webhook público /api/webhooks/llamadas: en vez de confiar
-- ciegamente en el texto libre que manda la plataforma externa como
-- "prompt" (que a veces es solo una nota corta de contexto, no un guion de
-- verdad, y termina reemplazando TODO el prompt del bot con algo roto),
-- la empresa puede definir reglas: "cuando el campo X del POST sea/contenga
-- Y, usa ESTE guion" — un texto completo que ella misma escribe y controla.
-- Se evalúan en orden (columna orden, menor primero); la primera que
-- matchea gana. Si ninguna matchea, se usa el comportamiento de siempre
-- (el prompt que mandó la plataforma externa, si mandó uno).
CREATE TABLE IF NOT EXISTS reglas_api_llamadas (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre                  TEXT NOT NULL,
    campo                   TEXT NOT NULL, -- nombre del campo del body del POST a revisar (ej. "origen")
    operador                TEXT NOT NULL DEFAULT 'igual', -- igual | contiene
    valor                   TEXT NOT NULL, -- contra qué se compara
    prompt_personalizado    TEXT NOT NULL, -- el guion completo a usar cuando la regla matchea
    activa                  BOOLEAN NOT NULL DEFAULT true,
    orden                   INTEGER NOT NULL DEFAULT 0,
    creado_en               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reglas_api_llamadas_empresa ON reglas_api_llamadas(empresa_id, orden);
