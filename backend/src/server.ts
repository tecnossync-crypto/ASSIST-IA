import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";

// El .env vive en la raíz del monorepo, no en backend/.
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

import Fastify from "fastify";
import formbody from "@fastify/formbody";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { healthRoutes } from "./routes/health.js";
import { webhooksTwilioRoutes } from "./routes/webhooks-twilio.js";
import { internalRoutes } from "./routes/internal.js";
import { llamadasRoutes } from "./routes/llamadas.js";
import { empresaRoutes } from "./routes/empresa.js";
import { llamadasSalientesRoutes } from "./routes/llamadas-salientes.js";
import { campanasRoutes } from "./routes/campanas.js";
import { resumenRoutes } from "./routes/resumen.js";
import { contactosRoutes } from "./routes/contactos.js";
import { flujosTrabajoRoutes } from "./routes/flujos-trabajo.js";
import { agentesRoutes } from "./routes/agentes.js";
import { colasRoutes } from "./routes/colas.js";
import { authRoutes } from "./routes/auth.js";
import { auditoriaRoutes } from "./routes/auditoria.js";
import { monitoreoRoutes } from "./routes/monitoreo.js";
import { grabacionesRoutes } from "./routes/grabaciones.js";
import { procesarTickCampanas } from "./jobs/dispatcher-campanas.js";
import { limpiarGrabacionesVencidas } from "./jobs/limpiar-grabaciones.js";

const app = Fastify({ logger: true });

// Twilio manda webhooks como application/x-www-form-urlencoded.
await app.register(formbody);
await app.register(cors, { origin: true });
// Límite generoso: 5 min de audio a buena calidad no debería pasar de ~30MB.
await app.register(multipart, { limits: { fileSize: 30 * 1024 * 1024 } });

await app.register(healthRoutes);
await app.register(webhooksTwilioRoutes);
await app.register(internalRoutes);
await app.register(llamadasRoutes);
await app.register(empresaRoutes);
await app.register(llamadasSalientesRoutes);
await app.register(campanasRoutes);
await app.register(resumenRoutes);
await app.register(contactosRoutes);
await app.register(flujosTrabajoRoutes);
await app.register(agentesRoutes);
await app.register(colasRoutes);
await app.register(authRoutes);
await app.register(auditoriaRoutes);
await app.register(monitoreoRoutes);
await app.register(grabacionesRoutes);

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

// Limpieza de grabaciones vencidas (retención configurable por empresa,
// 30 días por defecto): corre una vez por hora, no hace falta más seguido.
const LIMPIEZA_GRABACIONES_TICK_MS = Number(process.env.LIMPIEZA_GRABACIONES_TICK_MS ?? 60 * 60 * 1000);
setInterval(() => {
  limpiarGrabacionesVencidas()
    .then(({ borradas }) => {
      if (borradas > 0) app.log.info(`Limpieza de grabaciones: ${borradas} archivo(s) vencido(s) borrado(s)`);
    })
    .catch((err) => app.log.error(err, "Error en limpieza de grabaciones vencidas"));
}, LIMPIEZA_GRABACIONES_TICK_MS);
