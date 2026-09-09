-- Perfil de usuario más completo (teléfono, foto) + autenticación de dos
-- pasos (TOTP, app autenticadora tipo Google Authenticator/Authy).

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono TEXT;

-- Key dentro del bucket de storage (mismo S3/R2 que las grabaciones, ver
-- lib/storage.ts) — no la URL completa, así se sirve siempre a través de
-- nuestro propio endpoint (GET /api/agentes/:id/avatar) sin exponer el
-- bucket como público.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_key TEXT;

-- Secreto TOTP encriptado (AES-256-GCM, misma lib/crypto.ts que las
-- credenciales de Twilio) — nunca en claro en la base. Se guarda desde que
-- el usuario arranca la activación (2fa/iniciar), pero totp_habilitado
-- sigue en false hasta que confirme un código válido (2fa/confirmar) — así
-- un secreto generado y nunca confirmado no bloquea nada.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_habilitado BOOLEAN NOT NULL DEFAULT false;

-- Códigos de respaldo de un solo uso (por si el usuario pierde el teléfono
-- con la app autenticadora) — se guardan hasheados con bcrypt, igual que la
-- contraseña; nunca en texto plano. Cada uno se borra del arreglo al usarse.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_codigos_respaldo TEXT[] NOT NULL DEFAULT '{}';
