-- Horario opcional por regla del API (Configuración → Integraciones → Reglas):
-- cuando la regla aplica, la llamada sale con su prompt
--  - al instante (ambos NULL),
--  - N minutos después de recibir la solicitud (retraso_minutos), o
--  - en una fecha y hora fija (fecha_programada; si ya pasó, se usa el retraso o se llama ya).
-- Si la plataforma externa manda su propia hora en el POST, esa manda.
ALTER TABLE reglas_api_llamadas ADD COLUMN IF NOT EXISTS retraso_minutos INTEGER;
ALTER TABLE reglas_api_llamadas ADD COLUMN IF NOT EXISTS fecha_programada TIMESTAMPTZ;
