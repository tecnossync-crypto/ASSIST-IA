-- Extensión "solo directa": es el teléfono propio de un vendedor y NO entra al timbre del grupo del
-- departamento. Sirve cuando la central ya tiene una extensión de grupo (ej. ventas) que suena en todos los
-- teléfonos del equipo: sin esto, al sonar el grupo sonaría también cada extensión suelta (doble timbre).
-- Con el reparto "Al operador que originó la llamada" se marca primero SU extensión; si no contesta, el grupo.
ALTER TABLE extensiones_central ADD COLUMN IF NOT EXISTS solo_directa BOOLEAN NOT NULL DEFAULT false;
