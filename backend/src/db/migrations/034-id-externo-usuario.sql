-- Identificador externo por usuario (ej. código de empleado, id en un CRM
-- u otro sistema) — para que una integración pueda hacer match de "este
-- usuario de la plataforma es ese usuario en el otro sistema" sin depender
-- del email o el nombre. Puramente informativo: nada de la plataforma lo
-- usa internamente, solo se guarda y se muestra.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS id_externo TEXT;
