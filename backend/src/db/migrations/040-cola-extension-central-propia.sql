-- Transferencia de llamadas de IA hacia la central propia (Grandstream) en
-- vez de (o además de) agentes conectados a la plataforma — cada cola puede
-- tener su propia extensión/número interno en la PBX. NULL = esa cola sigue
-- funcionando exactamente igual que antes (solo agentes de la plataforma).
ALTER TABLE colas ADD COLUMN IF NOT EXISTS extension_central_propia TEXT;
