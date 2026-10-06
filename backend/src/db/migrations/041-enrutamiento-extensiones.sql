-- Enrutamiento de llamadas transferidas por la IA: dónde se atienden
-- (plataforma / central / ambos) y qué extensiones de la central suenan.
--
-- 'plataforma': solo agentes conectados al dashboard (comportamiento de siempre).
-- 'central':    directo a las extensiones de la central, sin pasar por agentes de la plataforma.
-- 'ambos':      primero agentes de la plataforma; si no hay ninguno disponible, extensiones de la central.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS enrutamiento_destino TEXT NOT NULL DEFAULT 'plataforma'
  CHECK (enrutamiento_destino IN ('plataforma', 'central', 'ambos'));

-- Cada cola puede pisar el destino de la empresa; NULL = usa el de la empresa.
ALTER TABLE colas ADD COLUMN IF NOT EXISTS destino_llamadas TEXT
  CHECK (destino_llamadas IN ('plataforma', 'central', 'ambos'));

-- Extensiones de la central propia (PBX). cola_id NULL = extensión "general",
-- que se usa cuando la llamada no tiene cola o su cola no tiene extensiones.
-- activa=false la saca de la rotación sin borrarla (así se elige entre "todas
-- las extensiones" o solo algunas específicas).
CREATE TABLE IF NOT EXISTS extensiones_central (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cola_id     UUID REFERENCES colas(id) ON DELETE SET NULL,
    numero      TEXT NOT NULL,
    nombre      TEXT,
    activa      BOOLEAN NOT NULL DEFAULT true,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_extensiones_central_empresa ON extensiones_central(empresa_id);
CREATE INDEX IF NOT EXISTS idx_extensiones_central_cola ON extensiones_central(cola_id);

-- Lo que ya estaba configurado como "una extensión por cola" pasa a la tabla nueva.
INSERT INTO extensiones_central (empresa_id, cola_id, numero)
SELECT empresa_id, id, trim(extension_central_propia)
FROM colas
WHERE extension_central_propia IS NOT NULL AND trim(extension_central_propia) <> ''
ON CONFLICT (empresa_id, numero) DO NOTHING;

-- Las colas que ya tenían extensión de respaldo y tienen central activa pasan a
-- 'ambos' (agentes primero, central de respaldo): es exactamente como se comportaban.
UPDATE colas SET destino_llamadas = 'ambos'
WHERE extension_central_propia IS NOT NULL AND trim(extension_central_propia) <> '';
