-- Cola de salida de las llamadas de IA (API, flujos): toda llamada pasa por llamadas_programadas y sale a ritmo
-- controlado, con un tope de llamadas simultáneas compartido con las campañas (ver lib/cola-salida-ia.ts).
--   enviada_en  = cuándo se le pidió la llamada a Twilio
--   terminada_en = cuándo terminó (callback de estado): mientras sea NULL cuenta como "en el aire"
ALTER TABLE llamadas_programadas ADD COLUMN IF NOT EXISTS enviada_en TIMESTAMPTZ;
ALTER TABLE llamadas_programadas ADD COLUMN IF NOT EXISTS terminada_en TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_llamadas_programadas_en_aire
  ON llamadas_programadas(call_sid) WHERE terminada_en IS NULL AND call_sid IS NOT NULL;

-- Las que ya salieron antes de esta migración no cuentan como "en el aire".
UPDATE llamadas_programadas SET enviada_en = creado_en WHERE estado = 'completada' AND enviada_en IS NULL;
UPDATE llamadas_programadas SET terminada_en = now() WHERE estado = 'completada' AND terminada_en IS NULL;

-- Anti-duplicados y trazabilidad de las solicitudes de la API:
--   referencia  = id del registro en la plataforma de origen (ej. id de la cotización en Zoho)
--   recibido_id = la fila de "Registros API" que originó la solicitud (para enlazarle la llamada al salir)
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS referencia TEXT;
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS recibido_id UUID;
CREATE INDEX IF NOT EXISTS idx_llamadas_webhook_referencia
  ON llamadas_webhook(empresa_id, referencia) WHERE referencia IS NOT NULL;

-- Horario permitido para llamadas de IA salientes automáticas (API, flujos, campañas). NULL = sin restricción.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS llamadas_ia_hora_desde TIME;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS llamadas_ia_hora_hasta TIME;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS llamadas_ia_dias SMALLINT[]; -- ISO: 1 = lunes … 7 = domingo; NULL = todos
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS llamadas_ia_zona TEXT;
