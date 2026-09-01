import "dotenv/config";
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { webhooksTwilioRoutes } from "./routes/webhooks-twilio.js";
import { internalRoutes } from "./routes/internal.js";
import { llamadasRoutes } from "./routes/llamadas.js";

const app = Fastify({ logger: true });

// Twilio manda webhooks como application/x-www-form-urlencoded.
await app.register(formbody);
await app.register(cors, { origin: true });

await app.register(healthRoutes);
await app.register(webhooksTwilioRoutes);
await app.register(internalRoutes);
await app.register(llamadasRoutes);

const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`voz-ia-backend escuchando en :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
