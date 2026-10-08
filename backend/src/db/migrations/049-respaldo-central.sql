-- Destino "plataforma primero, teléfonos de respaldo": cuando se timbra a los
-- asesores de la plataforma y ninguno contesta, a esta hora (respaldo_central_en)
-- la llamada pasa sola a las extensiones de la central, en vez de quedarse
-- esperando. NULL = no hay respaldo pendiente (un asesor contestó, la llamada
-- terminó o el destino no es "ambos").
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS respaldo_central_en TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_llamadas_respaldo_central ON llamadas(respaldo_central_en) WHERE respaldo_central_en IS NOT NULL;
