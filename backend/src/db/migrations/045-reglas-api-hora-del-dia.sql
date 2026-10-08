-- Reglas del API con "hora del día": en vez de una espera o una fecha fija,
-- la llamada sale la PRÓXIMA vez que sea esa hora (ej. 12:00): lo que llegue
-- antes de las 12:00 sale hoy a las 12:00; lo que llegue después, mañana a las
-- 12:00. Así se junta lo del día anterior y se llama todo a la hora elegida.
-- zona_horaria: zona IANA de quien configuró la regla (ej. America/Santo_Domingo).
ALTER TABLE reglas_api_llamadas ADD COLUMN IF NOT EXISTS hora_del_dia TIME;
ALTER TABLE reglas_api_llamadas ADD COLUMN IF NOT EXISTS zona_horaria TEXT;
