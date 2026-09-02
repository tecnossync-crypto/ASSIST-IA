-- Campañas de llamadas salientes masivas + seguimiento con reintentos.
-- Una campaña es una lista de contactos a llamar; cada contacto tiene su
-- propio estado y contador de intentos. El despachador (jobs/dispatcher-
-- campanas.ts) recorre las campañas "en_curso" y origina llamadas a ritmo
-- controlado, sin bloquear ni saturar la cuenta de Twilio.

CREATE TABLE IF NOT EXISTS campanas (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre                  TEXT NOT NULL,
    estado                  TEXT NOT NULL DEFAULT 'borrador', -- borrador | en_curso | pausada | completada
    guion_override          JSONB, -- mismo shape que empresas.guion_agente; null = usa el guion normal de la empresa
    reintentos_max          INTEGER NOT NULL DEFAULT 2,
    horas_entre_reintentos  NUMERIC NOT NULL DEFAULT 4,
    creado_en               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campanas_empresa_estado ON campanas(empresa_id, estado);

CREATE TABLE IF NOT EXISTS campana_contactos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campana_id          UUID NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero              TEXT NOT NULL,
    nombre              TEXT,
    estado              TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | llamando | completada | fallida
    intentos            INTEGER NOT NULL DEFAULT 0,
    ultima_llamada_id   UUID REFERENCES llamadas(id),
    proximo_intento_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campana_contactos_dispatch
    ON campana_contactos(campana_id, estado, proximo_intento_en);

-- Para poder ver, desde una llamada, si vino de una campaña.
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS campana_contacto_id UUID REFERENCES campana_contactos(id);
