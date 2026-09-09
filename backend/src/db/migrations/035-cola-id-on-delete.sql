-- Bug real encontrado: llamadas.cola_id y solicitudes.cola_id no tenían
-- política de borrado (default de Postgres = RESTRICT) — apenas una cola
-- tuviera aunque sea UNA llamada o solicitud asociada (algo normal apenas
-- se usa, no un caso raro), borrarla desde Configuración → Agentes fallaba
-- con un error de restricción de clave foránea en vez de simplemente
-- deshacer la asociación, como ya pasaba correctamente con usuarios.cola_id.

ALTER TABLE llamadas DROP CONSTRAINT IF EXISTS llamadas_cola_id_fkey;
ALTER TABLE llamadas ADD CONSTRAINT llamadas_cola_id_fkey
  FOREIGN KEY (cola_id) REFERENCES colas(id) ON DELETE SET NULL;

ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_cola_id_fkey;
ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_cola_id_fkey
  FOREIGN KEY (cola_id) REFERENCES colas(id) ON DELETE SET NULL;
