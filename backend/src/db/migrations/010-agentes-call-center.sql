-- Soporte para el ejecutable de call center: agentes se identifican con un
-- PIN corto (login completo llega después), se marcan disponibles/no
-- disponibles desde la app de escritorio, y la empresa elige cómo repartir
-- las llamadas entrantes entre los agentes conectados.

ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS disponible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultima_conexion TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_empresa_pin ON usuarios(empresa_id, pin) WHERE pin IS NOT NULL;

-- modo: "todos" (suena en todos los agentes disponibles, el primero que
-- conteste se la queda) | "round_robin" (por turnos) | "disponibilidad"
-- (al primero que se marcó disponible). turno_actual: índice interno del
-- round robin.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS enrutamiento_llamadas JSONB NOT NULL
  DEFAULT '{"modo":"todos","turno_actual":0}'::jsonb;
