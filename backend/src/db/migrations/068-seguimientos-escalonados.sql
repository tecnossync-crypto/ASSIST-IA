-- Llamadas de seguimiento escalonadas cuando el cliente no responde: lista de minutos entre un intento y el siguiente
-- (ej. {60,1440,4320} = a la hora, al dia siguiente y a los 3 dias). NULL = el reintento de siempre (intervalo fijo).
ALTER TABLE llamadas_webhook ADD COLUMN IF NOT EXISTS intervalos_reintento INTEGER[];
