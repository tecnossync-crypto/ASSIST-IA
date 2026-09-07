-- Igual que se hizo con contactos (migración 029): para poder eliminar un
-- usuario/agente sin que reviente por llamadas que contestó, esa referencia
-- pasa a NULL en vez de bloquear el borrado — el historial de la llamada se
-- conserva igual, solo se pierde el vínculo al agente ya eliminado.
ALTER TABLE llamadas DROP CONSTRAINT IF EXISTS llamadas_agente_usuario_id_fkey;
ALTER TABLE llamadas ADD CONSTRAINT llamadas_agente_usuario_id_fkey
  FOREIGN KEY (agente_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
