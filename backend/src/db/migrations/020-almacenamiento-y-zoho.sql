-- Tamaño real de cada grabación, para poder mostrar "cuánto almacenamiento
-- se está usando" en Configuración → Almacenamiento sin tener que consultar
-- S3 cada vez.
ALTER TABLE grabaciones ADD COLUMN IF NOT EXISTS tamano_bytes BIGINT;

-- Conexión OAuth de la empresa con Zoho WorkDrive: el cliente inicia sesión
-- con SU propia cuenta de Zoho (no comparte contraseñas ni claves) y
-- autoriza el acceso; acá solo se guarda el refresh token resultante
-- (encriptado igual que las demás credenciales) para poder subir copias de
-- las grabaciones automáticamente.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS zoho_workdrive_refresh_token_enc TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS zoho_workdrive_api_domain TEXT; -- Zoho usa distintos dominios de API según la región de la cuenta
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS zoho_workdrive_carpeta_id TEXT; -- carpeta destino en WorkDrive elegida por el cliente
