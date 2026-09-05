-- Cuántos días se conserva el audio de las grabaciones antes de borrarse
-- automáticamente del storage (el registro de la llamada y su transcripción
-- se quedan igual — solo se borra el archivo de audio y su fila en
-- `grabaciones`). Configurable por si algún cliente necesita más o menos.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS retencion_grabaciones_dias INTEGER NOT NULL DEFAULT 30;
