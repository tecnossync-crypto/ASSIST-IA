-- Vincular la plataforma con la central telefónica (PBX) propia del cliente
-- vía troncal SIP (ej. Twilio Elastic SIP Trunking) — para que las llamadas
-- salgan/entren por SU proveedor (Claro) en vez de por la red de Twilio.
-- Todo apagado por defecto (activa=false): mientras no se configure y
-- active explícitamente, el comportamiento de la empresa no cambia en
-- nada — sigue usando Twilio directo, como siempre.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS central_propia_activa BOOLEAN NOT NULL DEFAULT false;
-- Dominio o IP pública donde Twilio le entrega la llamada a la PBX (ej.
-- "pbx.miempresa.com" o una IP) — sin esto no hay a dónde mandar la llamada.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS central_propia_dominio TEXT;
-- 'ip' (whitelist de IP, sin usuario/clave) | 'credenciales' (usuario/clave SIP).
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS central_propia_auth_tipo TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS central_propia_usuario TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS central_propia_password_enc TEXT;
-- Cada sentido se activa por separado — a veces solo interesa que las
-- salientes salgan por la central propia, dejando las entrantes como están.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS central_propia_saliente BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS central_propia_entrante BOOLEAN NOT NULL DEFAULT true;
