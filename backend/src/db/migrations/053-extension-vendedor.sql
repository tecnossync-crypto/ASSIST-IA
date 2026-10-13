-- Cada extensión de la central puede pertenecer a un vendedor (su teléfono físico). Con el reparto
-- "Al operador que originó la llamada", si la transferencia es a la central, le suena SU extensión;
-- si no contesta (o no tiene extensión), pasa a las demás extensiones del departamento.
ALTER TABLE extensiones_central ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_extensiones_central_usuario ON extensiones_central(usuario_id) WHERE usuario_id IS NOT NULL;
