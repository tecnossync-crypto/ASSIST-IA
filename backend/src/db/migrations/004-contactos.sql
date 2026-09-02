-- Contactos ahora acumulan un perfil: apellido + datos JSONB (todo lo que
-- el agente vaya recolectando por llamadas, sea el campo por defecto
-- nombre/apellido/telefono o cualquier campo personalizado de la empresa).

ALTER TABLE contactos ADD COLUMN IF NOT EXISTS apellido TEXT;
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS datos JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now();
