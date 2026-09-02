-- Permite programar cuándo debe empezar a disparar una campaña, en vez de
-- solo "ahora" (botón Iniciar).
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS programada_para TIMESTAMPTZ;
