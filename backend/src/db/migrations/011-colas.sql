-- Colas de atención: grupos de agentes (ej. "Ventas", "Soporte"), cada una
-- con su propio modo de reparto. Reemplaza el enrutamiento único a nivel de
-- empresa por uno por cola — más flexible para dividir el trabajo.
CREATE TABLE IF NOT EXISTS colas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    enrutamiento    JSONB NOT NULL DEFAULT '{"modo":"todos","turno_actual":0}'::jsonb,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_colas_empresa ON colas(empresa_id);

-- Un agente pertenece (por ahora) a una sola cola; sin asignar = recibe
-- llamadas que no especifican cola (fallback general).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cola_id UUID REFERENCES colas(id) ON DELETE SET NULL;

-- Deja constancia de qué cola atendió cada llamada (para reportes y para
-- que el historial de "Llamadas" se pueda filtrar por cola más adelante).
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS cola_id UUID REFERENCES colas(id);
