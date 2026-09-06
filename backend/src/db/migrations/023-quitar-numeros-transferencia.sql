-- Limpieza: transferir a un número externo ya no existe en la plataforma
-- (todo se maneja por agentes/colas internas) — estas dos columnas quedaron
-- sin usar en el código desde ese cambio. Se dropean de una vez, ya
-- confirmado que nada las lee ni las escribe.
ALTER TABLE usuarios DROP COLUMN IF EXISTS telefono_transferencia;
ALTER TABLE empresas DROP COLUMN IF EXISTS numeros_transferencia;
