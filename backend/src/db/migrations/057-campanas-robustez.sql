-- Campañas más robustas: cuándo se empezó a llamar a cada contacto, para poder recuperar los que se quedan
-- "llamando" para siempre (reinicio del servidor, callback de Twilio que nunca llegó).
ALTER TABLE campana_contactos ADD COLUMN IF NOT EXISTS llamando_desde TIMESTAMPTZ;

-- Los que ya estaban "llamando" antes de esta migración empiezan a contar desde ahora.
UPDATE campana_contactos SET llamando_desde = now() WHERE estado = 'llamando' AND llamando_desde IS NULL;
