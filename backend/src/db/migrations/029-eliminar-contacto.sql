-- Para poder eliminar un contacto sin que reviente por llamadas/solicitudes
-- que lo referencian: en vez de bloquear el borrado (o borrar en cascada el
-- historial de llamadas, que sí se quiere conservar), esas referencias
-- simplemente quedan en NULL — el historial de la llamada se conserva
-- (numero_origen/numero_destino ya viven en la propia fila de llamadas),
-- solo se pierde el vínculo al perfil de contacto que ya no existe.
ALTER TABLE llamadas DROP CONSTRAINT IF EXISTS llamadas_contacto_id_fkey;
ALTER TABLE llamadas ADD CONSTRAINT llamadas_contacto_id_fkey
  FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE SET NULL;

ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_contacto_id_fkey;
ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_contacto_id_fkey
  FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE SET NULL;
