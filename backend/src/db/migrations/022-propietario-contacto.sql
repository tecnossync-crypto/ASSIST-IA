-- "Propietario" de un contacto: qué agente/usuario lo tiene asignado, para
-- repartir cartera entre el equipo (no tiene nada que ver con quién atendió
-- la última llamada). Si el usuario se elimina, el contacto se queda sin
-- propietario en vez de romperse.
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS propietario_usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contactos_propietario ON contactos(propietario_usuario_id);
