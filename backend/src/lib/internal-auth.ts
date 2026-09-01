import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Autenticación mínima entre servicios internos (voice-server → backend).
 * No es para el dashboard ni para Twilio: es un secreto compartido por env,
 * suficiente porque ambos servicios corren en la misma red de confianza.
 */
export function requireInternalKey(req: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    req.log.error("INTERNAL_API_KEY no está configurado en el backend");
    reply.code(500).send({ error: "internal_auth_not_configured" });
    return false;
  }

  const provided = req.headers["x-internal-key"];
  if (provided !== expected) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }

  return true;
}
