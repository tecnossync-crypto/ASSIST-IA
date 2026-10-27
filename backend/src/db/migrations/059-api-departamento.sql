-- Una solicitud de llamada de IA por API puede decir a qué DEPARTAMENTO pertenece (campo `departamento` o `colaId`):
-- esa llamada y sus solicitudes quedan siempre en ese departamento, en vez de que la IA lo elija sola por el nombre.
--   cola_id               = departamento ya resuelto (fijo para toda la llamada)
--   departamento_recibido = lo que mandó la plataforma, tal cual (para ver si no coincidió con ninguno)
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS cola_id UUID REFERENCES colas(id) ON DELETE SET NULL;
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS departamento_recibido TEXT;
