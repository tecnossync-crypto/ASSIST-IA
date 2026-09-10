-- Deja constancia de qué regla (si alguna) decidió el guion de una llamada
-- pedida por webhook externo — para que el panel de logs muestre "se usó
-- la regla X" en vez de solo el prompt final, y se pueda auditar por qué
-- salió el guion que salió.
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS regla_aplicada_id UUID REFERENCES reglas_api_llamadas(id) ON DELETE SET NULL;

-- Para que el panel de logs (Configuración → Integraciones → Ver todas)
-- pueda enlazar cada solicitud recibida con la llamada real que originó
-- (si originó una) — antes solo se veía el request crudo, sin poder saber
-- qué pasó después con esa llamada.
ALTER TABLE webhooks_recibidos ADD COLUMN IF NOT EXISTS call_sid TEXT;
