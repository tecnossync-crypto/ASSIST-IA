-- Plataforma de Voz IA — esquema núcleo (Fase 0)
-- Multi-tenant desde el día 1: toda tabla de datos operativos lleva empresa_id.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE empresas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre              TEXT NOT NULL,
    twilio_account_sid  TEXT,
    twilio_auth_token_enc TEXT,        -- encriptado a nivel de aplicación, nunca en claro
    twilio_phone_number TEXT UNIQUE,
    guion_agente        JSONB NOT NULL DEFAULT '{}'::jsonb, -- saludo, qué resuelve, cuándo transfiere
    horario_atencion    JSONB NOT NULL DEFAULT '{}'::jsonb,
    numeros_transferencia JSONB NOT NULL DEFAULT '[]'::jsonb,
    voz_agente          TEXT, -- id de voz TTS de ConversationRelay (ej. "en-US-Neural2-A"); null = voz por defecto de Twilio
    campos_personalizados JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{nombre, descripcion}] que el agente debe recolectar y guardar en datos_llamada
    etiquetas_disponibles JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{nombre, color}] catálogo de etiquetas para contactos
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
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero          TEXT NOT NULL,
    nombre          TEXT,
    apellido        TEXT,
    notas           TEXT,
    datos           JSONB NOT NULL DEFAULT '{}'::jsonb, -- campos personalizados capturados por el agente
    etiquetas       TEXT[] NOT NULL DEFAULT '{}',
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
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

-- Valores capturados de los campos personalizados que cada empresa configura
-- en `empresas.campos_personalizados` (ej. "número de póliza", "placa").
CREATE TABLE datos_llamada (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    llamada_id  UUID NOT NULL REFERENCES llamadas(id) ON DELETE CASCADE,
    campo       TEXT NOT NULL,
    valor       TEXT NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_datos_llamada_llamada ON datos_llamada(llamada_id);

-- Campañas de llamadas salientes masivas + seguimiento con reintentos.
CREATE TABLE campanas (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre                  TEXT NOT NULL,
    estado                  TEXT NOT NULL DEFAULT 'borrador', -- borrador | en_curso | pausada | completada
    guion_override          JSONB, -- mismo shape que empresas.guion_agente; null = usa el guion normal de la empresa
    reintentos_max          INTEGER NOT NULL DEFAULT 2,
    horas_entre_reintentos  NUMERIC NOT NULL DEFAULT 4,
    creado_en               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campanas_empresa_estado ON campanas(empresa_id, estado);

CREATE TABLE campana_contactos (
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

CREATE INDEX idx_campana_contactos_dispatch ON campana_contactos(campana_id, estado, proximo_intento_en);

-- Para poder ver, desde una llamada, si vino de una campaña.
ALTER TABLE llamadas ADD COLUMN campana_contacto_id UUID REFERENCES campana_contactos(id);

-- Flujos de trabajo: reglas simples "cuando termina una llamada así, hacer esto".
CREATE TABLE flujos_trabajo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    disparador      TEXT NOT NULL, -- llamada_completada | llamada_no_contesta | llamada_transferida
    accion          TEXT NOT NULL, -- agregar_etiqueta | crear_solicitud
    accion_datos    JSONB NOT NULL DEFAULT '{}'::jsonb,
    activo          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flujos_trabajo_empresa ON flujos_trabajo(empresa_id, disparador, activo);
