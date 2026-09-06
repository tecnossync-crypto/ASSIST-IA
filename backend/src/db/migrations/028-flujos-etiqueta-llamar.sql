-- Nuevo disparador de flujos de trabajo: "se agrega tal etiqueta a un
-- contacto" (antes solo había disparadores basados en cómo terminó una
-- llamada). disparador_datos guarda CUÁL etiqueta dispara la regla.
ALTER TABLE flujos_trabajo ADD COLUMN IF NOT EXISTS disparador_datos JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Cola de llamadas de IA programadas por un flujo de trabajo (acción
-- "llamar_contacto" con modo "programada"): el despachador de flujos
-- (jobs/dispatcher-flujos.ts) revisa esta tabla y origina la llamada cuando
-- llega fecha_programada.
CREATE TABLE IF NOT EXISTS llamadas_programadas (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    flujo_id         UUID REFERENCES flujos_trabajo(id) ON DELETE SET NULL,
    contacto_id      UUID REFERENCES contactos(id) ON DELETE CASCADE,
    numero           TEXT NOT NULL,
    fecha_programada TIMESTAMPTZ NOT NULL,
    estado           TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | completada | fallida | cancelada
    call_sid         TEXT,
    error            TEXT,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llamadas_programadas_pendientes
  ON llamadas_programadas(empresa_id, estado, fecha_programada);
