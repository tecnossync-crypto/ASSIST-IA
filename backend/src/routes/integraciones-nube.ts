import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { encriptar } from "../lib/crypto.js";
import { zohoConfigurado, construirUrlAutorizacion, intercambiarCodigo } from "../lib/zoho-workdrive.js";

/**
 * Conexión de cada empresa con sus propias cuentas de nube (hoy: Zoho
 * WorkDrive) vía OAuth — el cliente inicia sesión con su propia cuenta, no
 * comparte credenciales. El flujo es: dashboard abre /conectar → Zoho pide
 * login+consentimiento → Zoho redirige a /callback con un código → acá se
 * cambia por un refresh token y se guarda encriptado.
 */
export async function integracionesNubeRoutes(app: FastifyInstance) {
  function redirectUriCallback(): string {
    const base = process.env.PUBLIC_BASE_URL;
    if (!base) throw new Error("PUBLIC_BASE_URL no está configurado");
    return `${base}/api/integraciones/zoho-workdrive/callback`;
  }

  app.get<{ Querystring: { empresaId?: string } }>(
    "/api/integraciones/zoho-workdrive/estado",
    async (req, reply) => {
      const { empresaId } = req.query;
      if (!empresaId) {
        reply.code(400).send({ error: "empresaId es requerido" });
        return;
      }

      const result = await pool.query<{
        zoho_workdrive_refresh_token_enc: string | null;
        zoho_workdrive_carpeta_id: string | null;
      }>(
        "SELECT zoho_workdrive_refresh_token_enc, zoho_workdrive_carpeta_id FROM empresas WHERE id = $1",
        [empresaId]
      );

      reply.send({
        configurado: zohoConfigurado(),
        conectado: Boolean(result.rows[0]?.zoho_workdrive_refresh_token_enc),
        carpetaId: result.rows[0]?.zoho_workdrive_carpeta_id ?? null,
      });
    }
  );

  // El dashboard redirige (window.location) a este endpoint, que a su vez
  // redirige a Zoho — así el navegador del cliente hace login directo con
  // Zoho, nunca pasa credenciales por nuestro backend.
  app.get<{ Querystring: { empresaId?: string } }>(
    "/api/integraciones/zoho-workdrive/conectar",
    async (req, reply) => {
      const { empresaId } = req.query;
      if (!empresaId) {
        reply.code(400).send({ error: "empresaId es requerido" });
        return;
      }
      if (!zohoConfigurado()) {
        reply.code(400).send({ error: "Zoho WorkDrive no está configurado en la plataforma todavía" });
        return;
      }

      const url = construirUrlAutorizacion(empresaId, redirectUriCallback());
      reply.redirect(url);
    }
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/api/integraciones/zoho-workdrive/callback",
    async (req, reply) => {
      const { code, state: empresaId, error } = req.query;
      const dashboardUrl = process.env.DASHBOARD_PUBLIC_URL;

      if (error || !code || !empresaId) {
        reply.redirect(dashboardUrl ? `${dashboardUrl}/configuracion/almacenamiento?zoho=error` : "/");
        return;
      }

      try {
        const tokens = await intercambiarCodigo(code, redirectUriCallback());
        const refreshTokenEnc = tokens.refresh_token ? encriptar(tokens.refresh_token) : null;

        if (refreshTokenEnc) {
          await pool.query(
            `UPDATE empresas SET zoho_workdrive_refresh_token_enc = $2, zoho_workdrive_api_domain = $3 WHERE id = $1`,
            [empresaId, refreshTokenEnc, tokens.api_domain]
          );
        }

        reply.redirect(dashboardUrl ? `${dashboardUrl}/configuracion/almacenamiento?zoho=ok` : "/");
      } catch (err) {
        app.log.error({ err }, "Error en callback de Zoho WorkDrive");
        reply.redirect(dashboardUrl ? `${dashboardUrl}/configuracion/almacenamiento?zoho=error` : "/");
      }
    }
  );

  app.post<{ Body: { empresaId: string; carpetaId: string } }>(
    "/api/integraciones/zoho-workdrive/carpeta",
    async (req, reply) => {
      const { empresaId, carpetaId } = req.body;
      if (!empresaId || !carpetaId) {
        reply.code(400).send({ error: "empresaId y carpetaId son requeridos" });
        return;
      }

      await pool.query("UPDATE empresas SET zoho_workdrive_carpeta_id = $2 WHERE id = $1", [empresaId, carpetaId]);
      reply.send({ ok: true });
    }
  );

  app.post<{ Body: { empresaId: string } }>("/api/integraciones/zoho-workdrive/desconectar", async (req, reply) => {
    const { empresaId } = req.body;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }

    await pool.query(
      `UPDATE empresas SET zoho_workdrive_refresh_token_enc = NULL, zoho_workdrive_api_domain = NULL WHERE id = $1`,
      [empresaId]
    );
    reply.send({ ok: true });
  });
}
