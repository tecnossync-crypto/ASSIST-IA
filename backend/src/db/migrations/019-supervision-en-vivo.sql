-- Para que un supervisor pueda ver, en vivo, qué agente está en cada
-- llamada activa (no solo escuchar una llamada puntual que ya encontró).
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS agente_usuario_id UUID REFERENCES usuarios(id);
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS agentes_call_sids_identidad JSONB NOT NULL DEFAULT '{}'::jsonb;
