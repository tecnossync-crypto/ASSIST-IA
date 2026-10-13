-- "Al operador que originó la llamada": cuando una plataforma externa (ej. Zoho
-- SalesIQ) pide una llamada de IA y manda qué operador la disparó, se guarda aquí
-- para que, si la IA transfiere a una persona, le caiga a ESE operador.
--   operador_usuario_id : el asesor de la plataforma al que corresponde (si se pudo identificar)
--   operador_externo    : el valor tal cual lo mandó la plataforma externa (para diagnosticar)
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS operador_usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS operador_externo TEXT;
