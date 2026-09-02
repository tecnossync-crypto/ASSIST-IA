-- Gestor de llamadas: límites de tiempo configurables por empresa.
-- duracion_maxima_llamada_segundos: el voice-server corta la llamada (con
-- despedida) si se pasa de este límite.
-- timeout_timbrado_segundos: cuánto espera Twilio a que contesten antes de
-- darla por "no contesta" en llamadas salientes/campañas.

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS duracion_maxima_llamada_segundos INTEGER NOT NULL DEFAULT 600;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS timeout_timbrado_segundos INTEGER NOT NULL DEFAULT 30;
