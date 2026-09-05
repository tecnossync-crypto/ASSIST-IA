import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { requireInternalKey } from "../lib/internal-auth.js";
import { upsertContacto } from "../lib/contactos.js";
import { aplicarVariablesContacto } from "../lib/variables-prompt.js";

/**
 * Endpoints que solo llama el voice-server (nunca Twilio, nunca el dashboard).
 * El voice-server no toca Postgres directamente: pasa por aquí para que toda
 * escritura quede en un solo lugar y respete el aislamiento por empresa_id.
 */
export async function internalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", (req, reply, done) => {
    if (!requireInternalKey(req, reply)) return;
    done();
  });

  // El agente decidió que hace falta un humano. Marca la llamada con el
  // destino de transferencia; el webhook post-relay hará el <Dial> real
  // cuando ConversationRelay termine y TwiML caiga al <Redirect>.
  app.post<{
    Params: { callSid: string };
    Body: { numeroTransferencia: string };
  }>("/internal/llamadas/:callSid/transferir", async (req, reply) => {
    const { callSid } = req.params;
    const { numeroTransferencia } = req.body;

    if (!numeroTransferencia) {
      reply.code(400).send({ error: "numeroTransferencia es requerido" });
      return;
    }

    const result = await pool.query(
      `UPDATE llamadas
       SET transferida = true, transferencia_destino = $2, estado = 'transferida'
       WHERE call_sid = $1
       RETURNING id`,
      [callSid, numeroTransferencia]
    );

    if (result.rows.length === 0) {
      reply.code(404).send({ error: "llamada no encontrada" });
      return;
    }

    reply.send({ ok: true });
  });

  // Guarda la transcripción completa + resumen generado por el LLM al
  // terminar la llamada.
  app.post<{
    Params: { callSid: string };
    Body: {
      textoCompleto: unknown;
      resumenMotivo?: string;
      resumenSolicitud?: string;
      resumenResultado?: string;
      accionPendiente?: string;
      satisfaccion?: "positiva" | "neutral" | "negativa";
    };
  }>("/internal/llamadas/:callSid/transcripcion", async (req, reply) => {
    const { callSid } = req.params;
    const { textoCompleto, resumenMotivo, resumenSolicitud, resumenResultado, accionPendiente, satisfaccion } =
      req.body;

    const llamada = await pool.query<{ id: string; empresa_id: string }>(
      "SELECT id, empresa_id FROM llamadas WHERE call_sid = $1",
      [callSid]
    );

    if (llamada.rows.length === 0) {
      reply.code(404).send({ error: "llamada no encontrada" });
      return;
    }

    const { id: llamadaId, empresa_id: empresaId } = llamada.rows[0];

    await pool.query(
      `INSERT INTO transcripciones
         (empresa_id, llamada_id, texto_completo, resumen_motivo, resumen_solicitud, resumen_resultado, accion_pendiente, satisfaccion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        empresaId,
        llamadaId,
        JSON.stringify(textoCompleto),
        resumenMotivo ?? null,
        resumenSolicitud ?? null,
        resumenResultado ?? null,
        accionPendiente ?? null,
        satisfaccion ?? null,
      ]
    );

    reply.send({ ok: true });
  });

  // Guarda un campo personalizado que la empresa configuró recolectar
  // (ej. número de póliza, placa) y que el agente extrajo durante la llamada.
  app.post<{
    Params: { callSid: string };
    Body: { campo: string; valor: string };
  }>("/internal/llamadas/:callSid/dato", async (req, reply) => {
    const { callSid } = req.params;
    const { campo, valor } = req.body;

    if (!campo || !valor) {
      reply.code(400).send({ error: "campo y valor son requeridos" });
      return;
    }

    const llamada = await pool.query<{
      id: string;
      empresa_id: string;
      direccion: "entrante" | "saliente";
      numero_origen: string;
      numero_destino: string;
    }>(
      "SELECT id, empresa_id, direccion, numero_origen, numero_destino FROM llamadas WHERE call_sid = $1",
      [callSid]
    );

    if (llamada.rows.length === 0) {
      reply.code(404).send({ error: "llamada no encontrada" });
      return;
    }

    const { id: llamadaId, empresa_id: empresaId, direccion, numero_origen, numero_destino } =
      llamada.rows[0];

    await pool.query(
      `INSERT INTO datos_llamada (empresa_id, llamada_id, campo, valor) VALUES ($1, $2, $3, $4)`,
      [empresaId, llamadaId, campo, valor]
    );

    // El número del cliente (no el nuestro) es el que identifica el perfil.
    const numeroCliente = direccion === "entrante" ? numero_origen : numero_destino;
    await upsertContacto(empresaId, numeroCliente, campo, valor);

    reply.send({ ok: true });
  });

  // Registra lo que el cliente pidió (cotización, reclamo, cita...) según
  // lo extraiga el agente durante la llamada.
  app.post<{
    Params: { callSid: string };
    Body: { tipo?: string; descripcion?: string };
  }>("/internal/llamadas/:callSid/solicitud", async (req, reply) => {
    const { callSid } = req.params;
    const { tipo, descripcion } = req.body;

    const llamada = await pool.query<{ id: string; empresa_id: string }>(
      "SELECT id, empresa_id FROM llamadas WHERE call_sid = $1",
      [callSid]
    );

    if (llamada.rows.length === 0) {
      reply.code(404).send({ error: "llamada no encontrada" });
      return;
    }

    const { id: llamadaId, empresa_id: empresaId } = llamada.rows[0];

    await pool.query(
      `INSERT INTO solicitudes (empresa_id, llamada_id, tipo, descripcion)
       VALUES ($1, $2, $3, $4)`,
      [empresaId, llamadaId, tipo ?? null, descripcion ?? null]
    );

    reply.send({ ok: true });
  });

  // El voice-server necesita el guion y los números de transferencia de la
  // empresa al arrancar cada sesión de ConversationRelay. `numero` (el
  // teléfono del cliente en ESTA llamada) es opcional — si viene y ya
  // tenemos ese contacto guardado, se sustituyen las {{variables}} del
  // guion con sus datos reales.
  app.get<{ Params: { empresaId: string }; Querystring: { numero?: string } }>(
    "/internal/empresas/:empresaId/config-agente",
    async (req, reply) => {
      const { empresaId } = req.params;
      const { numero } = req.query;

      const result = await pool.query(
        `SELECT nombre, guion_agente, horario_atencion, numeros_transferencia, voz_agente, campos_personalizados,
                duracion_maxima_llamada_segundos, tiempo_respuesta_segundos
         FROM empresas WHERE id = $1`,
        [empresaId]
      );

      if (result.rows.length === 0) {
        reply.code(404).send({ error: "empresa no encontrada" });
        return;
      }

      const empresaRow = result.rows[0];
      const guionConVariables = await aplicarVariablesContacto(
        empresaRow.guion_agente,
        empresaRow.campos_personalizados ?? [],
        empresaId,
        numero
      );

      reply.send({ ...empresaRow, guion_agente: guionConVariables });
    }
  );

  // Igual que config-agente, pero para una llamada que sale de una campaña:
  // el guion_override de la campaña pisa (shallow merge) los campos del
  // guion_agente normal de la empresa. numeros_transferencia/voz/campos
  // personalizados siguen siendo los de la empresa — las campañas no los tocan.
  app.get<{ Params: { campanaContactoId: string } }>(
    "/internal/campana-contactos/:campanaContactoId/config-agente",
    async (req, reply) => {
      const { campanaContactoId } = req.params;

      const contacto = await pool.query<{ campana_id: string; empresa_id: string; numero: string }>(
        "SELECT campana_id, empresa_id, numero FROM campana_contactos WHERE id = $1",
        [campanaContactoId]
      );
      if (contacto.rows.length === 0) {
        reply.code(404).send({ error: "contacto de campaña no encontrado" });
        return;
      }
      const { campana_id: campanaId, empresa_id: empresaId, numero } = contacto.rows[0];

      const [empresa, campana] = await Promise.all([
        pool.query(
          `SELECT nombre, guion_agente, horario_atencion, numeros_transferencia, voz_agente, campos_personalizados,
                  duracion_maxima_llamada_segundos, tiempo_respuesta_segundos
           FROM empresas WHERE id = $1`,
          [empresaId]
        ),
        pool.query<{ guion_override: Record<string, unknown> | null }>(
          "SELECT guion_override FROM campanas WHERE id = $1",
          [campanaId]
        ),
      ]);

      if (empresa.rows.length === 0) {
        reply.code(404).send({ error: "empresa no encontrada" });
        return;
      }

      const empresaRow = empresa.rows[0];
      const override = campana.rows[0]?.guion_override ?? {};
      const guionCombinado = { ...empresaRow.guion_agente, ...override };
      const guionConVariables = await aplicarVariablesContacto(
        guionCombinado,
        empresaRow.campos_personalizados ?? [],
        empresaId,
        numero
      );

      reply.send({ ...empresaRow, guion_agente: guionConVariables });
    }
  );

  // Igual que config-agente, pero para una llamada pedida por una
  // plataforma externa vía webhook (Configuración → Integraciones → API):
  // si esa plataforma mandó un prompt para esta llamada puntual, reemplaza
  // el prompt_personalizado normal de la empresa (el resto del guion no
  // cambia — solo qué debe decir/hacer el agente en ESTA llamada).
  app.get<{ Params: { llamadaWebhookId: string } }>(
    "/internal/llamadas-webhook/:llamadaWebhookId/config-agente",
    async (req, reply) => {
      const { llamadaWebhookId } = req.params;

      const solicitud = await pool.query<{ empresa_id: string; prompt: string | null; numero: string }>(
        "SELECT empresa_id, prompt, numero FROM llamadas_webhook WHERE id = $1",
        [llamadaWebhookId]
      );
      if (solicitud.rows.length === 0) {
        reply.code(404).send({ error: "solicitud de llamada no encontrada" });
        return;
      }
      const { empresa_id: empresaId, prompt, numero } = solicitud.rows[0];

      const empresa = await pool.query(
        `SELECT nombre, guion_agente, horario_atencion, numeros_transferencia, voz_agente, campos_personalizados,
                duracion_maxima_llamada_segundos, tiempo_respuesta_segundos
         FROM empresas WHERE id = $1`,
        [empresaId]
      );
      if (empresa.rows.length === 0) {
        reply.code(404).send({ error: "empresa no encontrada" });
        return;
      }

      const empresaRow = empresa.rows[0];
      const guionCombinado = prompt
        ? { ...empresaRow.guion_agente, prompt_personalizado: prompt }
        : empresaRow.guion_agente;
      const guionConVariables = await aplicarVariablesContacto(
        guionCombinado,
        empresaRow.campos_personalizados ?? [],
        empresaId,
        numero
      );

      reply.send({ ...empresaRow, guion_agente: guionConVariables });
    }
  );
}
