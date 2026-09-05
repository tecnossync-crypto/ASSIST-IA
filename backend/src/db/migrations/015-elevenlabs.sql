-- Clonación de voz (ElevenLabs): la empresa sube un audio, se clona la voz
-- y queda lista para usarse en las llamadas vía ConversationRelay
-- (ttsProvider="ElevenLabs" voice="<voice_id>").
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS elevenlabs_api_key_enc TEXT;
