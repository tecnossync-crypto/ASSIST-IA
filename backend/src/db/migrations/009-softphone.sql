-- Credenciales para generar tokens de voz del navegador (Twilio Voice SDK):
-- así "llamada normal" conecta al operador dentro de la plataforma en vez
-- de reenviar a un teléfono externo.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS twilio_api_key_sid TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS twilio_api_key_secret_enc TEXT;
