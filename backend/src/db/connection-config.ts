import type { ClientConfig, PoolConfig } from "pg";

/**
 * RDS exige SSL pero su certificado no está en la cadena de confianza por
 * defecto de Node (self-signed en la cadena intermedia de Amazon). Para dev
 * usamos rejectUnauthorized:false (sigue siendo tráfico encriptado, solo no
 * valida la CA) — antes de producción, cambiar a verify-full con el bundle
 * de CA de RDS (https://truststore.pki.rds.amazonaws.com).
 */
export function buildConnectionConfig(connectionString: string): ClientConfig & PoolConfig {
  const requiereSsl = /sslmode=require/i.test(connectionString) || /rds\.amazonaws\.com/i.test(connectionString);
  const limpio = connectionString.replace(/[?&]sslmode=require/i, "");

  return {
    connectionString: limpio,
    ssl: requiereSsl ? { rejectUnauthorized: false } : undefined,
  };
}
