-- Flujos de trabajo con tiempo de espera: cuando una regla "al terminar una
-- llamada…" tiene retraso_minutos > 0 en accion_datos, en vez de ejecutar la
-- acción al instante se deja aquí; el despachador (jobs/dispatcher-flujos.ts)
-- la ejecuta cuando llega ejecutar_en. (Las reglas "se agrega una etiqueta →
-- llamar" con retraso reusan llamadas_programadas.)
CREATE TABLE IF NOT EXISTS flujos_pendientes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    flujo_id    UUID NOT NULL REFERENCES flujos_trabajo(id) ON DELETE CASCADE,
    llamada_id  UUID REFERENCES llamadas(id) ON DELETE CASCADE,
    numero      TEXT NOT NULL,
    disparador  TEXT NOT NULL,
    ejecutar_en TIMESTAMPTZ NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | completada | fallida
    error       TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flujos_pendientes_cola
  ON flujos_pendientes(estado, ejecutar_en);
