import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { empresaPorApiKey } from "../lib/api-keys.js";
import { clienteTwilioEmpresa, resolverDestinoSaliente } from "../lib/twilio-empresa.js";
import { registrarFallbackCentral } from "../lib/fallback-central.js";
import { asegurarContacto, upsertContacto } from "../lib/contactos.js";
import { registrarWebhookRecibido } from "../lib/webhooks-log.js";
import { evaluarReglaApiLlamadas, proximaOcurrencia } from "../lib/reglas-api-llamadas.js";
import { resolverOperadorExterno } from "../lib/operador-origen.js";
import { asesorLibre } from "../lib/agentes.js";
import { procesarSolicitudLlamadaIA } from "../lib/solicitud-llamada-ia.js";

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

  // Límite por IP: además de frenar la fuerza bruta del API key, frena el daño si una key se filtra. Es generoso
  // (120/min por defecto) porque un CRM que dispara muchas solicitudes seguidas sale todo desde la misma IP; para
  // envíos grandes está además el endpoint de lote. Cada llamada igual pasa por la cola con tope de simultáneas.
  const LIMITE_POR_MINUTO = Number(process.env.API_LLAMADAS_POR_MINUTO ?? 120);

  /** API key + JSON válido: lo común de los dos endpoints de llamadas con IA. Devuelve la empresa o responde el error. */
  async function autenticar(
    req: { headers: { "x-api-key"?: string; "x-prueba-interna"?: string }; body: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    endpoint: "llamadas"
  ): Promise<{ empresaId: string; esPrueba: boolean } | null> {
    const apiKey = req.headers["x-api-key"];
    const esPrueba = req.headers["x-prueba-interna"] === "1";
    if (!apiKey) {
      reply.code(401).send({ error: "Falta el header x-api-key" });
      return null;
    }
    const empresa = await empresaPorApiKey(apiKey);
    if (!empresa) {
      reply.code(401).send({ error: "API key inválido" });
      return null;
    }
    if (esJsonInvalido(req.body)) {
      await registrarWebhookRecibido({
        empresaId: empresa.id,
        endpoint,
        body: { crudo: req.body.crudo },
        ok: false,
        error: "El body no es JSON válido",
        esPrueba,
      });
      reply.code(400).send({ error: "El body no es JSON válido", crudo: req.body.crudo });
      return null;
    }
    return { empresaId: empresa.id, esPrueba };
  }

  app.post<{ Body: Record<string, unknown>; Headers: { "x-api-key"?: string; "x-prueba-interna"?: string } }>(
    "/api/webhooks/llamadas",
    { config: { rateLimit: { max: LIMITE_POR_MINUTO, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const auth = await autenticar(req, reply, "llamadas");
      if (!auth) return;
      const r = await procesarSolicitudLlamadaIA({
        empresaId: auth.empresaId,
        cuerpo: (req.body ?? {}) as Record<string, unknown>,
        esPrueba: auth.esPrueba,
      });
      reply.code(r.codigo).send(r.cuerpo);
    }
  );

  // Envío masivo: muchas llamadas en UNA solicitud (ej. el seguimiento semanal de las cotizaciones enviadas). Cada
  // elemento de "llamadas" acepta los mismos campos que la solicitud suelta; lo que se ponga arriba (origen, prompt,
  // departamento, operador, no_repetir_horas) vale para todos salvo que el elemento traiga el suyo. Las llamadas
  // entran a la cola y salen a ritmo controlado (tope de simultáneas, horario permitido); `espaciado_segundos`
  // reparte las salidas en el tiempo (ej. 30 = una cada 30 s). Máximo 500 por solicitud.
  app.post<{ Body: Record<string, unknown>; Headers: { "x-api-key"?: string; "x-prueba-interna"?: string } }>(
    "/api/webhooks/llamadas/lote",
    { bodyLimit: 5 * 1024 * 1024, config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const auth = await autenticar(req, reply, "llamadas");
      if (!auth) return;
      const cuerpo = (req.body ?? {}) as Record<string, unknown>;
      const items = cuerpo.llamadas;
      if (!Array.isArray(items) || items.length === 0) {
        reply.code(400).send({ error: 'El cuerpo debe traer "llamadas": una lista con al menos una llamada (cada una con su "numero").' });
        return;
      }
      if (items.length > 500) {
        reply.code(400).send({ error: `Máximo 500 llamadas por solicitud (mandaste ${items.length}). Divídelas en varios lotes.` });
        return;
      }

      const { llamadas: _lista, espaciado_segundos: espaciadoRaw, ...porDefecto } = cuerpo;
      const espaciado = Math.max(0, Math.min(Number(espaciadoRaw) || 0, 3600));
      const inicio = Date.now();

      const detalle: Record<string, unknown>[] = [];
      let aceptadas = 0;
      let duplicadas = 0;
      let errores = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
          errores++;
          detalle.push({ indice: i, ok: false, error: "Cada llamada debe ser un objeto con su numero" });
          continue;
        }
        const r = await procesarSolicitudLlamadaIA({
          empresaId: auth.empresaId,
          cuerpo: { ...porDefecto, ...(item as Record<string, unknown>) },
          esPrueba: auth.esPrueba,
          noAntesDe: espaciado > 0 ? new Date(inicio + i * espaciado * 1000) : null,
        });
        const numero = (item as Record<string, unknown>).numero;
        if (r.codigo >= 400) {
          errores++;
          detalle.push({ indice: i, numero, ok: false, error: r.cuerpo.error });
        } else if (r.cuerpo.duplicada) {
          duplicadas++;
          detalle.push({ indice: i, numero, ok: true, duplicada: true, motivo: r.cuerpo.motivo });
        } else {
          aceptadas++;
          detalle.push({
            indice: i,
            numero,
            ok: true,
            ...(r.cuerpo.callSid ? { estado: "llamando", callSid: r.cuerpo.callSid } : r.cuerpo.programada ? { estado: "programada" } : { estado: "en_cola", posicion_en_cola: r.cuerpo.posicion_en_cola }),
            ...(r.cuerpo.regla_aplicada ? { regla_aplicada: r.cuerpo.regla_aplicada } : {}),
            ...(r.cuerpo.aviso && !r.cuerpo.en_cola ? { aviso: r.cuerpo.aviso } : {}),
          });
        }
      }
      reply.send({ ok: errores === 0, total: items.length, aceptadas, duplicadas, errores, detalle });
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
    Body: {
      numero: string;
      colaId?: string;
      origen?: string;
      // Quién hizo clic en el CRM (email, id externo o nombre): la llamada se le pasa a ESE asesor.
      operador?: string;
      operador_id?: string;
      operador_email?: string;
      fuente?: string;
      agente?: string;
    };
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

      // Si el CRM dice quién hizo clic, la llamada se conecta con ESE asesor (su panel contesta solo, igual que
      // al marcar desde el panel). Si no se identifica, o no está Activo y libre, se reparte como siempre.
      const operadorRecibido = req.body.operador ?? req.body.operador_id ?? req.body.operador_email ?? req.body.agente;
      const operadorIdentificadoId = await resolverOperadorExterno(empresaId, operadorRecibido, req.body.fuente ?? req.body.origen);
      const asesorDirectoId = await asesorLibre(empresaId, operadorIdentificadoId);
      const informoOperador = typeof operadorRecibido === "string" && operadorRecibido.trim() !== "";

      const params = new URLSearchParams({ empresaId });
      if (colaId) params.set("colaId", colaId);
      if (asesorDirectoId) params.set("usuarioId", asesorDirectoId);
      params.set("origenExterno", origen?.trim() || "externo");

      // Ver llamadas-salientes.ts: si el cliente nunca contesta, el callback deja la llamada como "fallida".
      const urlEstado = `${publicBaseUrl}/webhooks/twilio/call-status?empresaId=${empresaId}&numero=${encodeURIComponent(numero)}&salienteNormal=1`;

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
          statusCallback: urlEstado,
          statusCallbackMethod: "POST",
          statusCallbackEvent: ["completed"],
          timeout: twilioEmpresa.timeoutTimbrado,
          sendDigits,
        });

        registrarFallbackCentral(call.sid, porCentralPropia, {
          empresaId,
          numero,
          voiceUrl: `${publicBaseUrl}/webhooks/twilio/voice-normal?${params.toString()}`,
          statusCallback: urlEstado,
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
        reply.send({
          ok: true,
          callSid: call.sid,
          ...(informoOperador
            ? { operador_identificado: Boolean(operadorIdentificadoId), operador_asignado: Boolean(asesorDirectoId) }
            : {}),
        });
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
