-- Cola de espera de llamadas: cuando la IA transfiere una llamada a una persona
-- y no hay asesores disponibles, el cliente espera en línea (con música) en vez
-- de que se le cuelgue, y los asesores ven la cola en el panel de teléfono y
-- eligen "Atender".
--
-- llamadas.en_cola_desde: desde cuándo espera (NULL = no está esperando, o ya
-- la tomó un asesor / terminó).
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS en_cola_desde TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_llamadas_en_cola ON llamadas(empresa_id, en_cola_desde) WHERE en_cola_desde IS NOT NULL;

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cola_espera_activa BOOLEAN NOT NULL DEFAULT true;
-- Tiempo máximo que un cliente espera antes de que se le cuelgue con un aviso.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cola_espera_max_minutos INTEGER NOT NULL DEFAULT 10
  CHECK (cola_espera_max_minutos BETWEEN 1 AND 60);
