import type { FastifyInstance } from "fastify";
import { atenderDeCola, listarColaEspera } from "../lib/cola-espera.js";

/**
 * Cola de espera de llamadas (panel de teléfono → pestaña "Cola"): clientes que
 * la IA transfirió y esperan en línea porque no había asesores disponibles.
 * Todo filtra por empresa_id.
 */
export async function colaEsperaRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { empresaId?: string; colaId?: string } }>("/api/cola-espera", async (req, reply) => {
    const { empresaId, colaId } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }
    reply.send({ llamadas: await listarColaEspera(empresaId, colaId) });
  });

  app.post<{ Params: { id: string }; Body: { empresaId?: string; usuarioId?: string | null } }>(
    "/api/cola-espera/:id/atender",
    async (req, reply) => {
      const { empresaId, usuarioId } = req.body ?? {};
      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!empresaId || !publicBaseUrl) {
        reply.code(400).send({ error: "empresaId es requerido" });
        return;
      }
      const r = await atenderDeCola({ empresaId, llamadaId: req.params.id, usuarioId, publicBaseUrl });
      if (!r.ok) {
        reply.code(r.codigo).send({ error: r.error });
        return;
      }
      reply.send({ ok: true });
    }
  );
}
