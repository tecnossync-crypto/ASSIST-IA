-- Cola de espera automática: cuando un asesor queda libre, el sistema le timbra al cliente que más espera.
--   asignada_a / asignada_en: a qué asesor se le está timbrando ahora esta llamada de la cola (y desde cuándo).
--   Sirven para no timbrar la misma llamada a dos asesores a la vez, ni dos llamadas al mismo asesor.
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS asignada_a UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS asignada_en TIMESTAMPTZ;

-- Índices parciales: la comprobación "¿está ocupado este asesor?" corre en cada transferencia.
CREATE INDEX IF NOT EXISTS idx_llamadas_agente_en_curso ON llamadas(agente_usuario_id)
  WHERE estado = 'en_curso' AND finalizada_en IS NULL AND agente_usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llamadas_asignada ON llamadas(asignada_a)
  WHERE asignada_a IS NOT NULL AND agente_call_sid IS NULL;
