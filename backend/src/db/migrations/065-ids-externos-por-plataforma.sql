-- Ids de un usuario en cada plataforma externa. Cada plataforma (SalesIQ, el CRM...) identifica a las personas con su
-- propio id, y ese id puede coincidir con el de otra plataforma pero ser de otra persona. Por eso se guarda por
-- plataforma ("fuente"): la solicitud trae `origen` (ej. "zoho-salesiq", "zoho-crm") y se busca solo en los ids de esa fuente.
CREATE TABLE IF NOT EXISTS usuarios_ids_externos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    fuente      TEXT NOT NULL,
    valor       TEXT NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_ids_externos_unico ON usuarios_ids_externos(empresa_id, fuente, lower(valor));
CREATE INDEX IF NOT EXISTS idx_usuarios_ids_externos_usuario ON usuarios_ids_externos(usuario_id);

-- El "Id externo" que ya existía (un solo valor por usuario) sigue valiendo para cualquier plataforma.
