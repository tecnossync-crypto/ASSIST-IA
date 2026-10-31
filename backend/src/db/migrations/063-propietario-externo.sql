-- Propietario del cliente tal como lo manda el CRM (ej. "Ariel David Henriquez Sierra" en Zoho). Si coincide con un
-- usuario de la plataforma, además se asigna como propietario_usuario_id; si no, el texto queda aquí para saber
-- de quién es y poder asignarlo a mano después.
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS propietario_externo TEXT;
