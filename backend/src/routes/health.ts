import type { FastifyInstance } from "fastify";
import { ENTORNO, VERSION } from "../lib/entorno.js";

export async function healthRoutes(app: FastifyInstance) {
  // entorno y versión sirven para comprobar rápido QUÉ está corriendo (qa o prod, y qué commit).
  app.get("/health", async () => ({ ok: true, service: "voz-ia-backend", entorno: ENTORNO, version: VERSION }));
}
