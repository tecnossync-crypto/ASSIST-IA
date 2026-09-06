-- Los usuarios que ya estaban conectados (disponible/en descanso) desde
-- ANTES de que existiera usuarios_conexiones no tenían ninguna sesión
-- abierta que sumar — por eso el tiempo conectado salía en 0 (o incompleto)
-- aunque el estado mostrara "Conectado". Se completa una sesión abierta
-- para esos casos, usando ultima_conexion como inicio (lo más cercano que
-- hay a cuándo entraron realmente).
-- Con el NOT EXISTS es seguro correrla de nuevo en cada deploy: no duplica
-- si el usuario ya tiene una sesión abierta (normal o de este backfill).
INSERT INTO usuarios_conexiones (usuario_id, conectado_en)
SELECT u.id, COALESCE(u.ultima_conexion, now())
FROM usuarios u
WHERE u.estado_presencia <> 'desconectado'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_conexiones c
    WHERE c.usuario_id = u.id AND c.desconectado_en IS NULL
  );
