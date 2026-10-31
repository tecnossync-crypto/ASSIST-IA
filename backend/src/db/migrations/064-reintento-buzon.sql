-- Reintento automático de las llamadas de IA pedidas por API (ej. SalesIQ): si la llamada cae en buzón de voz o
-- no la contestan, se vuelve a intentar N minutos después, hasta agotar los reintentos.
--   reintentos_restantes: cuántos reintentos quedan (0 = no reintentar)
--   minutos_reintento:    espera antes de cada reintento
--   reintento_creado:     ya se programó el reintento de esta llamada (evita duplicarlo si Twilio repite el aviso)
--   reintento_de / intento: encadenan los intentos de una misma solicitud
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS reintentos_restantes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS minutos_reintento INTEGER;
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS reintento_creado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS reintento_de UUID;
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS intento INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_llamadas_webhook_call_sid ON llamadas_webhook(call_sid) WHERE call_sid IS NOT NULL;
