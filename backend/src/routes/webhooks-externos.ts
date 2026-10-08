import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { empresaPorApiKey } from "../lib/api-keys.js";
import { clienteTwilioEmpresa, resolverDestinoSaliente } from "../lib/twilio-empresa.js";
import { registrarFallbackCentral } from "../lib/fallback-central.js";
import { asegurarContacto, upsertContacto } from "../lib/contactos.js";
import { registrarWebhookRecibido } from "../lib/webhooks-log.js";
import { evaluarReglaApiLlamadas } from "../lib/reglas-api-llamadas.js";

interface CampoPersonalizado {
  nombre: string;
  api_name?: string;
}

const MARCA_JSON_INVALIDO = "__json_invalido__";

/** true si el body vino marcado como JSON inválido por el parser de abajo. */
function esJsonInvalido(body: unknown): body is { [MARCA_JSON_INVALIDO]: true; crudo: string } {
  return typeof body === "object" && body !== null && MARCA_JSON_INVALIDO in body;
}

/**
 * Webhook público para que plataformas externas (un CRM, un e-commerce, un
 * sistema de tickets, etc.) pidan que la plataforma llame a un cliente con
 * IA. Se autentica con el API key de la empresa (Configuración →
 * Integraciones), no con sesión de dashboard — este endpoint SÍ está
 * pensado para exponerse a internet.
 */
export async function webhooksExternosRoutes(app: FastifyInstance) {
  // Por defecto, si el body no es JSON válido pero el content-type dice que
  // sí, Fastify responde un 400 genérico (FST_ERR_CTP_INVALID_JSON_BODY)
  // ANTES de que la ruta llegue a correr — así que nunca queda registrado en
  // "Solicitudes recibidas", justo cuando más hace falta verlo (una
  // plataforma como Zoho mandando un JSON mal armado). Se reemplaza el
  // parser SOLO para estas rutas (Fastify encapsula por plugin/register) para
  // que el body inválido llegue igual al handler y se pueda registrar con un
  // mensaje útil, en vez de perderse en un error genérico.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(null, { [MARCA_JSON_INVALIDO]: true, crudo: body as string });
    }
  });

  app.post<{
    Body: {
      numero: string;
      prompt?: string;
      origen?: string;
      fecha_programada?: string;
      retraso_minutos?: number | string;
    };
    Headers: { "x-api-key"?: string; "x-prueba-interna"?: string };
  }>(
    "/api/webhooks/llamadas",
    // Límite por IP: además de evitar fuerza bruta del API key, frena el
    // daño si una key se filtra (no se pueden disparar cientos de llamadas
    // por minuto, cada una es un costo real en la cuenta de Twilio del cliente).
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const apiKey = req.headers["x-api-key"];
      const esPrueba = req.headers["x-prueba-interna"] === "1";
      if (!apiKey) {
        reply.code(401).send({ error: "Falta el header x-api-key" });
        return;
      }

      const empresa = await empresaPorApiKey(apiKey);
      if (!empresa) {
        reply.code(401).send({ error: "API key inválido" });
        return;
      }
      const empresaId = empresa.id;

      if (esJsonInvalido(req.body)) {
        await registrarWebhookRecibido({
          empresaId,
          endpoint: "llamadas",
          body: { crudo: req.body.crudo },
          ok: false,
          error: "El body no es JSON válido",
          esPrueba,
        });
        reply.code(400).send({ error: "El body no es JSON válido", crudo: req.body.crudo });
        return;
      }

      const { numero, prompt, origen, fecha_programada: fechaProgramada, retraso_minutos: retrasoRaw } = req.body ?? {};
      if (!numero || typeof numero !== "string" || !/^\+?[\d\s()-]{7,}$/.test(numero)) {
        const error = "numero es requerido y debe ser un teléfono válido (ej. +18095551234)";
        await registrarWebhookRecibido({ empresaId, endpoint: "llamadas", body: req.body, ok: false, error, esPrueba });
        reply.code(400).send({ error });
        return;
      }

      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!publicBaseUrl) {
        reply.code(500).send({ error: "PUBLIC_BASE_URL no está configurado" });
        return;
      }

      // Hora opcional en la que debe dispararse la llamada. Dos formas:
      // - fecha_programada: fecha y hora ISO 8601 CON zona horaria
      //   (ej. "2026-10-10T15:00:00-04:00"); sin zona sería ambiguo y la
      //   llamada podría salir horas antes o después de lo que se quería.
      // - retraso_minutos: llamar dentro de N minutos.
      // Si vienen las dos, manda fecha_programada. Sin ninguna: llama ya.
      let programadaPara: Date | null = null;
      const errorHora = (() => {
        if (fechaProgramada !== undefined && fechaProgramada !== null && fechaProgramada !== "") {
          if (typeof fechaProgramada !== "string" || !/(Z|[+-]d{2}:?d{2})$/i.test(fechaProgramada.trim())) {
            return "fecha_programada debe incluir la zona horaria (ej. 2026-10-10T15:00:00-04:00 o terminar en Z)";
          }
          const d = new Date(fechaProgramada.trim());
          if (Number.isNaN(d.getTime())) return "fecha_programada no es una fecha válida (formato ISO 8601)";
          if (d.getTime() - Date.now() > 90 * 24 * 60 * 60 * 1000) return "fecha_programada no puede ser a más de 90 días";
          programadaPara = d;
        } else if (retrasoRaw !== undefined && retrasoRaw !== null && retrasoRaw !== "") {
          const n = Number(retrasoRaw);
          if (!Number.isFinite(n) || n < 0) return "retraso_minutos debe ser un número de minutos (0 o más)";
          if (n > 90 * 24 * 60) return "retraso_minutos no puede ser a más de 90 días";
          programadaPara = new Date(Date.now() + Math.floor(n) * 60_000);
        }
        return null;
      })();
      if (errorHora) {
        await registrarWebhookRecibido({ empresaId, endpoint: "llamadas", body: req.body, ok: false, error: errorHora, esPrueba });
        reply.code(400).send({ error: errorHora });
        return;
      }
      // Si la hora ya pasó (o es dentro de menos de un minuto) se llama de una vez.
      const llamarDespues = programadaPara !== null && programadaPara.getTime() - Date.now() > 60_000;

      const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
      if (!twilioEmpresa) {
        const error = "La empresa no tiene credenciales Twilio configuradas";
        await registrarWebhookRecibido({ empresaId, endpoint: "llamadas", body: req.body, ok: false, error, esPrueba });
        reply.code(400).send({ error });
        return;
      }

      // Si alguna regla de Configuración → Integraciones matchea (según los
      // campos que mandó esta plataforma externa), su guion manda por
      // encima del "prompt" crudo que haya mandado la plataforma — así la
      // empresa controla el guion real en vez de confiar en texto libre
      // que a veces es solo una nota de contexto, no un prompt de verdad.
      const reglaAplicada = await evaluarReglaApiLlamadas(empresaId, req.body as Record<string, unknown>);
      // Un prompt vacío, de solo espacios o que no sea texto cuenta como "no
      // mandó prompt": cae al prompt genérico de la empresa.
      const promptCliente = typeof prompt === "string" && prompt.trim() ? prompt.trim().slice(0, 8000) : undefined;
      const promptFinal = reglaAplicada?.promptPersonalizado ?? promptCliente;

      const solicitud = await pool.query<{ id: string }>(
        `INSERT INTO llamadas_webhook (empresa_id, numero, prompt, origen, regla_aplicada_id, programada_para)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          empresaId,
          numero,
          promptFinal ?? null,
          origen ?? null,
          reglaAplicada?.reglaId ?? null,
          llamarDespues ? programadaPara : null,
        ]
      );
      const llamadaWebhookId = solicitud.rows[0].id;

      await asegurarContacto(empresaId, numero);

      // Con hora futura: no se llama ahora, queda en la cola de llamadas
      // programadas (la despacha jobs/dispatcher-flujos.ts, con este prompt).
      if (llamarDespues && programadaPara) {
        await pool.query(
          `INSERT INTO llamadas_programadas (empresa_id, numero, fecha_programada, llamada_webhook_id)
           VALUES ($1, $2, $3, $4)`,
          [empresaId, numero, programadaPara, llamadaWebhookId]
        );
        app.log.info({ numero, origen, programadaPara }, "Llamada vía webhook externo programada");
        await registrarWebhookRecibido({ empresaId, endpoint: "llamadas", body: req.body, ok: true, esPrueba });
        reply.send({ ok: true, programada: true, fecha_programada: programadaPara.toISOString(), id: llamadaWebhookId });
        return;
      }

      try {
        const { to, sendDigits, urlExtra, porCentralPropia } = resolverDestinoSaliente(
          numero,
          twilioEmpresa.centralPropia
        );
        const call = await twilioEmpresa.client.calls.create({
          to,
          from: twilioEmpresa.fromNumber,
          url: `${publicBaseUrl}/webhooks/twilio/voice-outbound?empresaId=${empresaId}&webhookLlamadaId=${llamadaWebhookId}${urlExtra}`,
          method: "POST",
          statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
          statusCallbackMethod: "POST",
          statusCallbackEvent: ["completed"],
          timeout: twilioEmpresa.timeoutTimbrado,
          sendDigits,
        });

        registrarFallbackCentral(call.sid, porCentralPropia, {
          empresaId,
          numero,
          voiceUrl: `${publicBaseUrl}/webhooks/twilio/voice-outbound?empresaId=${empresaId}&webhookLlamadaId=${llamadaWebhookId}`,
          statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
        });

        app.log.info({ callSid: call.sid, numero, origen }, "Llamada originada vía webhook externo");
        await registrarWebhookRecibido({
          empresaId,
          endpoint: "llamadas",
          body: req.body,
          ok: true,
          esPrueba,
          callSid: call.sid,
        });
        reply.send({ ok: true, callSid: call.sid, id: llamadaWebhookId });
      } catch (err) {
        app.log.error({ err, numero }, "Error originando llamada vía webhook externo");
        await registrarWebhookRecibido({
          empresaId,
          endpoint: "llamadas",
          body: req.body,
          ok: false,
          error: String(err),
          esPrueba,
        });
        reply.code(502).send({ error: "No se pudo originar la llamada", detalle: String(err) });
      }
    }
  );

  // "Click-to-call" desde una plataforma de terceros: en vez de que conteste
  // la IA (como /api/webhooks/llamadas), esta pide una llamada NORMAL — el
  // cliente se conecta directo con un agente humano de la plataforma, igual
  // que si alguien hubiera marcado desde el panel de teléfono del dashboard.
  // Reusa exactamente el mismo flujo de conferencia (voice-normal +
  // iniciarConferenciaConAgentes), solo que el número lo origina un webhook
  // externo en vez del botón "Llamar" del dashboard.
  app.post<{
    Body: { numero: string; colaId?: string; origen?: string };
    Headers: { "x-api-key"?: string; "x-prueba-interna"?: string };
  }>(
    "/api/webhooks/llamar-agente",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const apiKey = req.headers["x-api-key"];
      const esPrueba = req.headers["x-prueba-interna"] === "1";
      if (!apiKey) {
        reply.code(401).send({ error: "Falta el header x-api-key" });
        return;
      }

      const empresa = await empresaPorApiKey(apiKey);
      if (!empresa) {
        reply.code(401).send({ error: "API key inválido" });
        return;
      }
      const empresaId = empresa.id;

      if (esJsonInvalido(req.body)) {
        await registrarWebhookRecibido({
          empresaId,
          endpoint: "llamar-agente",
          body: { crudo: req.body.crudo },
          ok: false,
          error: "El body no es JSON válido",
          esPrueba,
        });
        reply.code(400).send({ error: "El body no es JSON válido", crudo: req.body.crudo });
        return;
      }

      const { numero, colaId, origen } = req.body ?? {};
      if (!numero || typeof numero !== "string" || !/^\+?[\d\s()-]{7,}$/.test(numero)) {
        const error = "numero es requerido y debe ser un teléfono válido (ej. +18095551234)";
        await registrarWebhookRecibido({
          empresaId,
          endpoint: "llamar-agente",
          body: req.body,
          ok: false,
          error,
          esPrueba,
        });
        reply.code(400).send({ error });
        return;
      }

      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!publicBaseUrl) {
        reply.code(500).send({ error: "PUBLIC_BASE_URL no está configurado" });
        return;
      }

      const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
      if (!twilioEmpresa) {
        const error = "La empresa no tiene credenciales Twilio configuradas";
        await registrarWebhookRecibido({
          empresaId,
          endpoint: "llamar-agente",
          body: req.body,
          ok: false,
          error,
          esPrueba,
        });
        reply.code(400).send({ error });
        return;
      }

      await asegurarContacto(empresaId, numero);

      const params = new URLSearchParams({ empresaId });
      if (colaId) params.set("colaId", colaId);
      params.set("origenExterno", origen?.trim() || "externo");

      try {
        const { to, sendDigits, urlExtra, porCentralPropia } = resolverDestinoSaliente(
          numero,
          twilioEmpresa.centralPropia
        );
        const call = await twilioEmpresa.client.calls.create({
          to,
          from: twilioEmpresa.fromNumber,
          url: `${publicBaseUrl}/webhooks/twilio/voice-normal?${params.toString()}${urlExtra}`,
          method: "POST",
          statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
          statusCallbackMethod: "POST",
          statusCallbackEvent: ["completed"],
          timeout: twilioEmpresa.timeoutTimbrado,
          sendDigits,
        });

        registrarFallbackCentral(call.sid, porCentralPropia, {
          empresaId,
          numero,
          voiceUrl: `${publicBaseUrl}/webhooks/twilio/voice-normal?${params.toString()}`,
          statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status`,
        });

        app.log.info({ callSid: call.sid, numero, origen }, "Llamada a agente originada vía webhook externo");
        await registrarWebhookRecibido({
          empresaId,
          endpoint: "llamar-agente",
          body: req.body,
          ok: true,
          esPrueba,
          callSid: call.sid,
        });
        reply.send({ ok: true, callSid: call.sid });
      } catch (err) {
        app.log.error({ err, numero }, "Error originando llamada a agente vía webhook externo");
        await registrarWebhookRecibido({
          empresaId,
          endpoint: "llamar-agente",
          body: req.body,
          ok: false,
          error: String(err),
          esPrueba,
        });
        reply.code(502).send({ error: "No se pudo originar la llamada", detalle: String(err) });
      }
    }
  );

  // Para que una plataforma externa (Zoho u otra) empuje datos de un
  // contacto hacia acá — ej. cuando algo cambia del lado de ellos. Las
  // claves de "datos" son los api_name configurados en Configuración →
  // Contactos (no el nombre visible), así el mapeo no se rompe si alguien
  // traduce o edita el nombre del campo después.
  app.post<{
    Body: { numero: string; datos: Record<string, string> };
    Headers: { "x-api-key"?: string; "x-prueba-interna"?: string };
  }>(
    "/api/webhooks/contactos",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const apiKey = req.headers["x-api-key"];
      const esPrueba = req.headers["x-prueba-interna"] === "1";
      if (!apiKey) {
        reply.code(401).send({ error: "Falta el header x-api-key" });
        return;
      }

      const empresa = await empresaPorApiKey(apiKey);
      if (!empresa) {
        reply.code(401).send({ error: "API key inválido" });
        return;
      }
      const empresaId = empresa.id;

      if (esJsonInvalido(req.body)) {
        await registrarWebhookRecibido({
          empresaId,
          endpoint: "contactos",
          body: { crudo: req.body.crudo },
          ok: false,
          error: "El body no es JSON válido",
          esPrueba,
        });
        reply.code(400).send({ error: "El body no es JSON válido", crudo: req.body.crudo });
        return;
      }

      const { numero, datos } = req.body ?? {};
      if (!numero || typeof numero !== "string") {
        const error = "numero es requerido";
        await registrarWebhookRecibido({ empresaId, endpoint: "contactos", body: req.body, ok: false, error, esPrueba });
        reply.code(400).send({ error });
        return;
      }
      if (!datos || typeof datos !== "object") {
        const error = "datos es requerido (objeto con claves = api_name)";
        await registrarWebhookRecibido({ empresaId, endpoint: "contactos", body: req.body, ok: false, error, esPrueba });
        reply.code(400).send({ error });
        return;
      }

      const empresaRow = await pool.query<{ campos_personalizados: CampoPersonalizado[] }>(
        "SELECT campos_personalizados FROM empresas WHERE id = $1",
        [empresaId]
      );
      const campos = empresaRow.rows[0]?.campos_personalizados ?? [];
      const nombrePorApiName = new Map(
        campos.filter((c) => c.api_name).map((c) => [c.api_name as string, c.nombre])
      );

      await asegurarContacto(empresaId, numero);

      const aplicados: string[] = [];
      const ignorados: string[] = [];
      for (const [apiName, valor] of Object.entries(datos)) {
        const nombreCampo = nombrePorApiName.get(apiName) ?? (apiName === "nombre" || apiName === "apellido" ? apiName : null);
        if (!nombreCampo || typeof valor !== "string" || !valor.trim()) {
          ignorados.push(apiName);
          continue;
        }
        await upsertContacto(empresaId, numero, nombreCampo, valor);
        aplicados.push(apiName);
      }

      await registrarWebhookRecibido({
        empresaId,
        endpoint: "contactos",
        body: req.body,
        ok: true,
        error: ignorados.length > 0 ? `Ignorados (sin api_name configurado): ${ignorados.join(", ")}` : undefined,
        esPrueba,
      });
      reply.send({ ok: true, aplicados, ignorados });
    }
  );

  // URL de prueba: NO origina ninguna llamada ni toca ningún contacto — solo
  // recibe y registra lo que le manden, para que la plataforma de terceros
  // pueda apuntar acá mientras se configura el mapeo de campos, y en
  // Configuración → Integraciones se vea exactamente qué llegó (con qué
  // nombres de campo, qué formato, etc.) antes de cambiar la URL a la real
  // (/llamar-agente, /llamadas o /contactos).
  app.post<{ Body: unknown; Headers: { "x-api-key"?: string } }>(
    "/api/webhooks/prueba",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const apiKey = req.headers["x-api-key"];
      if (!apiKey) {
        reply.code(401).send({ error: "Falta el header x-api-key" });
        return;
      }

      const empresa = await empresaPorApiKey(apiKey);
      if (!empresa) {
        reply.code(401).send({ error: "API key inválido" });
        return;
      }

      // Acá especialmente: si el JSON viene mal armado, es justo lo que esta
      // URL existe para detectar — se registra igual (con el texto crudo) en
      // vez de devolver un 400 genérico sin contexto.
      if (esJsonInvalido(req.body)) {
        await registrarWebhookRecibido({
          empresaId: empresa.id,
          endpoint: "prueba",
          body: { crudo: req.body.crudo },
          ok: false,
          error: "El body no es JSON válido",
        });
        reply.code(400).send({
          error: "El body no es JSON válido",
          crudo: req.body.crudo,
          pista: "Revisa comillas sin escapar, comas de más, o variables de la plataforma que no se hayan reemplazado.",
        });
        return;
      }

      await registrarWebhookRecibido({ empresaId: empresa.id, endpoint: "prueba", body: req.body, ok: true });
      reply.send({ ok: true, mensaje: "Recibido — revisa Configuración → Integraciones para ver el detalle.", recibido: req.body });
    }
  );

  // Para que Configuración → Integraciones muestre las últimas solicitudes
  // que llegaron a los 3 webhooks de arriba (reales o de prueba) — así se
  // puede verificar qué mandó de verdad la plataforma de terceros antes de
  // dar la integración por buena.
  // limite/offset para paginar (el panel completo de logs pide de a
  // páginas); endpoint/ok opcionales para filtrar. Sin filtros, se
  // comporta igual que antes (últimas N, sin importar cuáles).
  app.get<{
    Querystring: { empresaId?: string; limite?: string; offset?: string; endpoint?: string; ok?: string };
  }>("/api/webhooks/recientes", async (req, reply) => {
    const { empresaId, limite, offset, endpoint, ok } = req.query;
    if (!empresaId) {
      reply.code(400).send({ error: "empresaId es requerido" });
      return;
    }
    const lim = Math.min(parseInt(limite ?? "20", 10) || 20, 100);
    const off = Math.max(parseInt(offset ?? "0", 10) || 0, 0);

    const condiciones = ["empresa_id = $1"];
    const valores: unknown[] = [empresaId];
    if (endpoint) {
      valores.push(endpoint);
      condiciones.push(`endpoint = $${valores.length}`);
    }
    if (ok === "true" || ok === "false") {
      valores.push(ok === "true");
      condiciones.push(`ok = $${valores.length}`);
    }

    const totalResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM webhooks_recibidos WHERE ${condiciones.join(" AND ")}`,
      valores
    );

    valores.push(lim, off);
    const result = await pool.query(
      `SELECT id, endpoint, body, ok, error, es_prueba, call_sid, creado_en
       FROM webhooks_recibidos
       WHERE ${condiciones.join(" AND ")}
       ORDER BY creado_en DESC
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores
    );
    reply.send({ solicitudes: result.rows, total: Number(totalResult.rows[0].total) });
  });

  // Detalle de una sola solicitud — para el panel dedicado de "Registros
  // API" (antes solo se veía la lista, sin una vista de detalle aparte).
  app.get<{ Params: { id: string } }>("/api/webhooks/recientes/:id", async (req, reply) => {
    const result = await pool.query(
      `SELECT id, empresa_id, endpoint, body, ok, error, es_prueba, call_sid, creado_en
       FROM webhooks_recibidos WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      reply.code(404).send({ error: "no encontrado" });
      return;
    }
    reply.send({ solicitud: result.rows[0] });
  });
}
