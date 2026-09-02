-- Pausa artificial (en segundos) antes de que el bot responda tras oír al
-- cliente, para que la conversación no se sienta instantánea/robótica.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS tiempo_respuesta_segundos NUMERIC NOT NULL DEFAULT 0;
