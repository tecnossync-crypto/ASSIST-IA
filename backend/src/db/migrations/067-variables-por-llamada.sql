-- Datos propios de CADA solicitud de llamada por API (ej. aseguradora, tipo de renovacion, fecha de vencimiento).
-- Se usan como {{variables}} en el prompt de esa llamada y se le muestran a la IA como "datos de esta llamada".
-- Van en la llamada y no en el contacto: la renovacion de hoy no debe pisar la de la proxima vez.
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS variables JSONB NOT NULL DEFAULT '{}'::jsonb;
