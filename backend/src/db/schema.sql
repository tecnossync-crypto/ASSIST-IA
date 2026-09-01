-- Plataforma de Voz IA — esquema núcleo (Fase 0)
-- Multi-tenant desde el día 1: toda tabla de datos operativos lleva empresa_id.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE empresas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre              TEXT NOT NULL,
    twilio_account_sid  TEXT,
    twilio_auth_token_enc TEXT,        -- encriptado a nivel de aplicación, nunca en claro
    twilio_phone_number TEXT,
    guion_agente        JSONB NOT NULL DEFAULT '{}'::jsonb, -- saludo, qué resuelve, cuándo transfiere
    horario_atencion    JSONB NOT NULL DEFAULT '{}'::jsonb,
    numeros_transferencia JSONB NOT NULL DEFAULT '[]'::jsonb,
    activa              BOOLEAN NOT NULL DEFAULT true,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    rol             TEXT NOT NULL DEFAULT 'operador', -- admin | operador
    telefono_transferencia TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, email)
);

CREATE TABLE contactos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero      TEXT NOT NULL,
    nombre      TEXT,
    notas       TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero)
);

CREATE TABLE llamadas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    contacto_id         UUID REFERENCES contactos(id),
    call_sid            TEXT NOT NULL UNIQUE,
    direccion           TEXT NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
    numero_origen       TEXT NOT NULL,
    numero_destino      TEXT NOT NULL,
    estado              TEXT NOT NULL DEFAULT 'en_curso', -- en_curso | completada | fallida | transferida
    transferida         BOOLEAN NOT NULL DEFAULT false,
    transferencia_destino TEXT, -- número al que se redirige cuando el agente decide transferir
    duracion_segundos   INTEGER,
    costo_estimado_usd  NUMERIC(10, 4),
    iniciada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizada_en       TIMESTAMPTZ
);

CREATE INDEX idx_llamadas_empresa ON llamadas(empresa_id, iniciada_en DESC);

CREATE TABLE grabaciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    llamada_id      UUID NOT NULL REFERENCES llamadas(id) ON DELETE CASCADE,
    url_storage     TEXT NOT NULL,          -- ubicación en storage propio (R2/S3)
    duracion_segundos INTEGER,
    hash_integridad TEXT NOT NULL,          -- hash del archivo para constancia
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transcripciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    llamada_id      UUID NOT NULL REFERENCES llamadas(id) ON DELETE CASCADE,
    texto_completo  JSONB NOT NULL,   -- turnos con hablante + timestamp
    resumen_motivo  TEXT,
    resumen_solicitud TEXT,
    resumen_resultado TEXT,
    accion_pendiente TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE solicitudes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    llamada_id      UUID REFERENCES llamadas(id),
    contacto_id     UUID REFERENCES contactos(id),
    tipo            TEXT,               -- cotizacion | reclamo | cita | otro
    descripcion     TEXT,
    estado          TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | en_proceso | resuelta
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_solicitudes_empresa_estado ON solicitudes(empresa_id, estado);
