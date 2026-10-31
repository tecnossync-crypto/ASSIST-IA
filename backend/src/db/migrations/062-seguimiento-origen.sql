-- Quién propuso el seguimiento de un cliente: 'ia' (la IA lo dedujo de la conversación, ej. "llámeme mañana en la
-- tarde") o 'vendedor' (lo programó una persona). Una propuesta de la IA se puede reemplazar con una llamada nueva;
-- lo que programó el vendedor no se pisa.
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS seguimiento_origen TEXT;
