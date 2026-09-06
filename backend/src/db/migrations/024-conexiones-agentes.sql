-- Historial de conexión de cada usuario (cuándo se conectó/desconectó como
-- agente), para poder sumar "tiempo de línea activo" por intervalo en el
-- dashboard. "Conectado" = disponible o en descanso (sigue en línea, solo
-- pausado); "desconectado" cierra la sesión abierta. No se toca nada al
-- pasar de disponible <-> descanso, solo al entrar/salir del todo.
CREATE TABLE IF NOT EXISTS usuarios_conexiones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    conectado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    desconectado_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_usuarios_conexiones_usuario ON usuarios_conexiones(usuario_id, conectado_en DESC);
