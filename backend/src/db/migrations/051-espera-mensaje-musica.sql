-- Nuevo tipo de espera "mensaje_musica": se lee el mensaje (ej. la presentación
-- de los productos) y a continuación suena la música; se repite mientras espera.
ALTER TABLE empresas DROP CONSTRAINT IF EXISTS empresas_espera_tipo_check;
ALTER TABLE empresas ADD CONSTRAINT empresas_espera_tipo_check
  CHECK (espera_tipo IN ('musica', 'audio', 'mensaje', 'mensaje_musica', 'silencio'));
