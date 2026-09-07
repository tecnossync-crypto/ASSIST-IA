-- Permite "probar" una campaña (llamada de prueba con el guion_override de
-- esa campaña) sin que ese contacto cuente en el progreso/reporte real ni
-- lo recoja el despachador automático (jobs/dispatcher-campanas.ts solo
-- toma estado='pendiente', así que una fila de prueba con estado='llamando'
-- nunca se vuelve a marcar sola).
ALTER TABLE campana_contactos ADD COLUMN IF NOT EXISTS es_prueba BOOLEAN NOT NULL DEFAULT false;
