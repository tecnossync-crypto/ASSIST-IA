import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";

// El .env vive en la raíz del monorepo, no en backend/.
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

import Fastify from "fastify";
import formbody from "@fastify/formbody";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { webhooksTwilioRoutes } from "./routes/webhooks-twilio.js";
import { internalRoutes } from "./routes/internal.js";
import { llamadasRoutes } from "./routes/llamadas.js";
import { empresaRoutes } from "./routes/empresa.js";
import { llamadasSalientesRoutes } from "./routes/llamadas-salientes.js";
import { campanasRoutes } from "./routes/campanas.js";
import { procesarTickCampanas } from "./jobs/dispatcher-campanas.js";

const app = Fastify({ logger: true });

// Twilio manda webhooks como application/x-www-form-urlencoded.
await app.register(formbody);
await app.register(cors, { origin: true });

await app.register(healthRoutes);
await app.register(webhooksTwilioRoutes);
await app.register(internalRoutes);
await app.register(llamadasRoutes);
await app.register(empresaRoutes);
await app.register(llamadasSalientesRoutes);
await app.register(campanasRoutes);

const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`voz-ia-backend escuchando en :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

// Despachador de campañas: corre dentro del mismo proceso del backend (no
// es un worker separado) — revisa cada TICK_MS si hay contactos listos para
// llamar en campañas "en_curso".
const TICK_MS = Number(process.env.CAMPANAS_TICK_MS ?? 20_000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL;

if (publicBaseUrl) {
  setInterval(() => {
    procesarTickCampanas(publicBaseUrl).catch((err) => {
      app.log.error(err, "Error en tick del despachador de campañas");
    });
  }, TICK_MS);
  app.log.info(`Despachador de campañas activo cada ${TICK_MS}ms`);
} else {
  app.log.warn("PUBLIC_BASE_URL no configurado: despachador de campañas deshabilitado");
}
