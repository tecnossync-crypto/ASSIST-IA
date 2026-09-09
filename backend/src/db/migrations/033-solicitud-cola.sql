-- Para que una solicitud registrada (sin transferir en vivo) quede marcada
-- con el departamento que corresponde, igual que ya pasa con las
-- transferencias en vivo (llamadas.cola_id) — así quien la gestione después
-- sabe a qué área pertenece.
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS cola_id UUID REFERENCES colas(id);
