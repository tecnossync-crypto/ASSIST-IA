-- Tercer estado además de "disponible/no disponible": el botón de estado del
-- dashboard ahora permite marcarse "en descanso" (conectado pero pausado),
-- distinto de "desconectado" del todo. `disponible` sigue siendo el único
-- campo que lee la regla de asignación de llamadas (no se toca su lógica):
-- tanto "descanso" como "desconectado" dejan disponible = false.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado_presencia TEXT NOT NULL DEFAULT 'desconectado';
