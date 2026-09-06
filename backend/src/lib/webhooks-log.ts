import { pool } from "../db/pool.js";

/**
 * Bitácora de cada request que llega a los webhooks públicos — para que
 * Configuración → Integraciones pueda mostrar exactamente qué mandó la
 * plataforma de terceros (o una prueba manual) antes de conectar todo de
 * verdad. Nunca debe tirar la request real si falla (es solo un registro).
 */
export async function registrarWebhookRecibido(opts: {
  empresaId: string;
  endpoint: "llamar-agente" | "llamadas" | "contactos" | "prueba";
  body: unknown;
  ok: boolean;
  error?: string;
  esPrueba?: boolean;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO webhooks_recibidos (empresa_id, endpoint, body, ok, error, es_prueba)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [opts.empresaId, opts.endpoint, JSON.stringify(opts.body ?? {}), opts.ok, opts.error ?? null, opts.esPrueba ?? false]
    );
  } catch (err) {
    console.error("No se pudo registrar el webhook recibido (no bloquea la request real)", err);
  }
}
