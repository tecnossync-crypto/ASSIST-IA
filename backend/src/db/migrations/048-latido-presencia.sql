-- Latido de presencia: el panel de teléfono avisa cada ~30 s que sigue abierto
-- mientras el asesor está Activo o En pausa. Si dejan de llegar (cerraron el
-- navegador, se apagó la computadora), el estado pasa solo a Inactivo y deja de
-- repartírsele llamadas que nadie iba a contestar.
-- NULL = nunca usó el panel nuevo (ej. quien usa solo el ejecutable de
-- escritorio): a esos no se les expira el estado.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_latido TIMESTAMPTZ;
