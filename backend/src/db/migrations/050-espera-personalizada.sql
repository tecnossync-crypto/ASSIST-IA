-- Espera del cliente configurable: lo que oye mientras un asesor lo pone en
-- pausa (hold) o mientras espera que lo atiendan tras una transferencia.
--   musica   : la canción estándar (comportamiento de siempre)
--   audio    : un archivo propio (URL https pública de un mp3/wav)
--   mensaje  : un texto que una voz lee en bucle
--   silencio : sin sonido
-- espera_aviso: frase que se dice UNA vez antes de esperar, al transferir
-- (vacío = el comportamiento de siempre).
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS espera_tipo TEXT NOT NULL DEFAULT 'musica'
  CHECK (espera_tipo IN ('musica', 'audio', 'mensaje', 'silencio'));
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS espera_audio_url TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS espera_mensaje TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS espera_aviso TEXT;
