-- Seguimiento comercial por cliente: cuándo y por qué volver a contactarlo (ej. "dijo que lo llame más tarde").
-- Lo programa el vendedor (propietario del contacto) desde la sección "Seguimiento".
--   seguimiento_estado: NULL = sin seguimiento | 'pendiente' = hay que volver a contactarlo | 'hecho' = ya se hizo
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS seguimiento_fecha TIMESTAMPTZ;
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS seguimiento_nota TEXT;
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS seguimiento_estado TEXT;
ALTER TABLE contactos DROP CONSTRAINT IF EXISTS contactos_seguimiento_estado_chk;
ALTER TABLE contactos ADD CONSTRAINT contactos_seguimiento_estado_chk
  CHECK (seguimiento_estado IS NULL OR seguimiento_estado IN ('pendiente', 'hecho'));
CREATE INDEX IF NOT EXISTS idx_contactos_seguimiento
  ON contactos(empresa_id, seguimiento_fecha) WHERE seguimiento_estado = 'pendiente';
