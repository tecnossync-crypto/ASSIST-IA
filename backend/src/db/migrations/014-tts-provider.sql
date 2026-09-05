-- ConversationRelay necesita "ttsProvider" y "voice" como atributos
-- separados (ej. ttsProvider="amazon" voice="Pedro-Neural") — el catálogo
-- anterior guardaba un solo string mezclado ("Amazon.Polly.Pedro-Neural"),
-- que Twilio no reconoce.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS tts_provider TEXT;

-- Arregla el dato que ya quedó mal guardado con el formato viejo.
UPDATE empresas
SET tts_provider = 'amazon', voz_agente = 'Pedro-Neural'
WHERE voz_agente = 'Amazon.Polly.Pedro-Neural';
