-- Contexto para el vendedor: cuando la IA transfiere una llamada a una persona,
-- el panel de teléfono del dashboard muestra el resumen de lo que habló el
-- cliente con el bot (qué quiere, datos capturados, conversación) para que el
-- vendedor no tenga que volver a preguntar todo. Se puede apagar por empresa.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS mostrar_resumen_transferencia BOOLEAN NOT NULL DEFAULT true;
