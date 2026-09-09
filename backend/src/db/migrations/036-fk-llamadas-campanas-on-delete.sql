-- Mismo tipo de bug que 035, encontrado por revisión preventiva (no hay
-- todavía una función en el dashboard para borrar una llamada o una
-- campaña completa, pero si se agrega más adelante, sin esto fallaría con
-- un error de restricción de clave foránea en vez de simplemente deshacer
-- la asociación):
--
-- - campana_contactos.ultima_llamada_id apuntaba a llamadas sin política de
--   borrado — borrar esa llamada fallaría.
-- - llamadas.campana_contacto_id apuntaba a campana_contactos sin política
--   de borrado — borrar una campaña (que sí cascadea sobre sus
--   campana_contactos) fallaría en cuanto una de esas llamadas existiera.

ALTER TABLE campana_contactos DROP CONSTRAINT IF EXISTS campana_contactos_ultima_llamada_id_fkey;
ALTER TABLE campana_contactos ADD CONSTRAINT campana_contactos_ultima_llamada_id_fkey
  FOREIGN KEY (ultima_llamada_id) REFERENCES llamadas(id) ON DELETE SET NULL;

ALTER TABLE llamadas DROP CONSTRAINT IF EXISTS llamadas_campana_contacto_id_fkey;
ALTER TABLE llamadas ADD CONSTRAINT llamadas_campana_contacto_id_fkey
  FOREIGN KEY (campana_contacto_id) REFERENCES campana_contactos(id) ON DELETE SET NULL;
