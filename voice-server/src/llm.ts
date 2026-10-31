import OpenAI from "openai";
import { TOOLS, ejecutarTool } from "./tools.js";
import type { EmpresaConfig } from "./types.js";

// Sin esto, el SDK usa su default de 10 MINUTOS de timeout — en una llamada
// en vivo eso es indistinguible de "el bot nunca responde": si OpenAI
// responde lento un momento, el cliente se queda en silencio total (nada de
// audio, ni siquiera el saludo inicial) mientras el request cuelga en
// segundo plano, muy por delante de cualquier fallback de error que ya
// exista más arriba (esos solo se activan cuando la llamada finalmente
// falla — con 10 minutos de margen, en la práctica nunca llegan a tiempo).
// 12s es generoso para gpt-4o-mini y deja margen para 1 reintento rápido.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 12_000, maxRetries: 1 });

// Modelo por defecto para el agente de voz. Ajustable por variable de
// entorno sin tocar código si se quiere probar otro tier.
const MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";

/**
 * Construye el system prompt de la empresa. Dos modos, elegidos por la
 * propia empresa en su `guion_agente` (JSON, por tenant):
 * - `prompt_personalizado`: la empresa escribe su propio prompt completo.
 * - Campos guiados (saludo, que_resuelve, ...): armamos el prompt nosotros.
 * En ambos casos se agregan al final las reglas de herramientas, que no
 * son negociables porque de eso depende que transferir/registrar funcionen.
 */
export function construirSystemPrompt(empresa: EmpresaConfig): string {
  const g = empresa.guion_agente ?? {};

  const base = g.prompt_personalizado?.trim()
    ? g.prompt_personalizado.trim()
    : [
        `Eres el agente de atención telefónica de "${empresa.nombre}". Hablas por teléfono: respuestas cortas, naturales, sin listas ni markdown.`,
        g.saludo ? `Saludo inicial sugerido: "${g.saludo}"` : "",
        g.que_resuelve ? `Qué resuelves en esta línea: ${g.que_resuelve}` : "",
        g.datos_a_tomar?.length ? `Datos que debes recolectar del cliente: ${g.datos_a_tomar.join(", ")}.` : "",
        g.cuando_transferir ? `Cuándo transferir a un humano: ${g.cuando_transferir}` : "",
        g.instrucciones_extra ?? "",
      ]
        .filter(Boolean)
        .join("\n");

  const campos = empresa.campos_personalizados ?? [];
  const listaCampos = campos.length
    ? campos.map((c) => (c.descripcion ? `${c.nombre} (${c.descripcion})` : c.nombre)).join(", ")
    : null;

  // Departamentos/colas configurados por la empresa (Configuración →
  // Agentes). Si hay más de uno, el modelo debe indicar cuál corresponde
  // (colaId) al usar transferir_a_humano O registrar_solicitud; si solo hay
  // uno o ninguno, no hace falta elegir (el backend reparte entre todos los
  // agentes por defecto, o la solicitud queda sin departamento específico).
  const colas = empresa.colas ?? [];
  const listaColas =
    colas.length > 1
      ? `Departamentos disponibles (usa el "id" EXACTO, no el nombre, en el campo colaId de transferir_a_humano ` +
        `o registrar_solicitud, según a cuál le corresponda el pedido): ${colas.map((c) => `"${c.nombre}" [id: ${c.id}]`).join(", ")}.`
      : null;

  // Si ya conocemos a este cliente (llamada a/de un número que ya está en
  // Contactos), esto le dice al bot explícitamente qué ya sabe y qué le
  // falta — SIN depender de que la empresa haya escrito {{variables}} en su
  // guion (antes, si no las usaba, el bot no tenía forma de enterarse de
  // nada y volvía a preguntar todo desde cero cada vez).
  const contacto = empresa.contacto_conocido;
  const nombreConocido = contacto ? [contacto.nombre, contacto.apellido].filter(Boolean).join(" ") : "";
  const datosConocidos: string[] = [];
  const datosFaltantes: string[] = [];
  for (const c of campos) {
    const valor = contacto?.datos?.[c.nombre];
    if (valor) datosConocidos.push(`${c.nombre}: ${valor}`);
    else datosFaltantes.push(c.nombre);
  }
  const bloqueContacto = contacto
    ? [
        nombreConocido
          ? `Ya sabes que este cliente se llama ${nombreConocido} — salúdalo por su nombre y NO le preguntes el nombre de nuevo.`
          : "No tienes el nombre de este cliente todavía — pregúntaselo en algún momento natural de la llamada.",
        datosConocidos.length
          ? `Datos que YA TIENES guardados de este cliente (no se los vuelvas a pedir): ${datosConocidos.join(", ")}.`
          : "",
        datosFaltantes.length
          ? `Datos que TODAVÍA necesitas pedirle: ${datosFaltantes.join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : null;

  return [
    // No condicional al guion: si el prompt_personalizado de la empresa no
    // menciona el idioma, el modelo puede terminar respondiendo en inglés
    // (le pasó a un cliente real) — esto va siempre, sin depender de lo que
    // haya escrito la empresa.
    "Responde SIEMPRE en español (nunca en inglés ni otro idioma), sin importar en qué idioma te hablen.",
    base,
    bloqueContacto,
    "Si el cliente te da un nombre/apellido/dato DISTINTO al que ya tenías guardado (una corrección), guárdalo de " +
      'nuevo con registrar_dato — el nuevo valor reemplaza al anterior. Fuera de eso, con datos que ya tienes no ' +
      "hace falta llamar registrar_dato de nuevo.",
    listaCampos
      ? `Campos que esta empresa necesita que recolectes del cliente, además de lo anterior: ${listaCampos}. ` +
        "Usa la herramienta registrar_dato una vez por cada uno en cuanto el cliente te lo dé."
      : "",
    // Reglas POR DEFECTO: valen solo donde el guion de arriba no dice otra cosa. Antes iban al final sin
    // aclararlo y pisaban lo que la empresa escribió sobre cuándo transferir (la IA dudaba o hacía preguntas).
    "REGLAS POR DEFECTO (si tus instrucciones de arriba dicen otra cosa sobre cuándo transferir o registrar, " +
      "SIGUE LAS DE ARRIBA; estas solo aplican donde no se dijo nada):",
    "Cuando el cliente pida algo (pagar, cotizar, información, un cambio en su cuenta/póliza, un reclamo no " +
      "urgente, etc.), tu opción por defecto es usar registrar_solicitud: guarda el pedido en cuanto lo tengas " +
      "claro (no esperes a que termine la llamada) y avísale en tu propia respuesta que un gestor se va a " +
      "comunicar con él/ella para continuar. NO transfieras la llamada para esto.",
    "Si el cliente pide hablar con una persona (un asesor, vendedor, agente o supervisor), usa transferir_a_humano " +
      "DE INMEDIATO, sin pedirle datos ni verificaciones antes. También transfiere si está molesto/insatisfecho, el " +
      "caso es urgente, o está fuera de lo que puedes resolver o registrar bien. Para lo demás, registra la solicitud.",
    "NUNCA pidas contraseñas, claves, PIN ni códigos de verificación al cliente, ni siquiera para transferirlo.",
    listaColas,
    "Nunca inventes información que no tengas; si no sabes algo, dilo y ofrece transferir.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Genera el saludo inicial CON el modelo, usando el mismo system prompt que
 * el resto de la conversación — así el saludo siempre coincide con el
 * prompt personalizado o guiado que la empresa configuró, en vez de un
 * texto fijo aparte que se podía desincronizar del guion real.
 */
/**
 * Qué se le pide al modelo para abrir la llamada. Depende de QUIÉN llamó: si el cliente llamó, "acabas de
 * contestar"; si la llamamos nosotros (API, campañas, flujos), el cliente acaba de contestar NUESTRA llamada
 * y no corresponde decir "gracias por llamar" (contradecía el guion: "te llamo para confirmar tu cita").
 */
export function instruccionDeSaludo(saliente: boolean): string {
  return saliente
    ? "\n\nTÚ estás llamando al cliente y acaba de contestar. Salúdalo, preséntate brevemente y dile el motivo de tu " +
        "llamada según tus instrucciones. NO digas \"gracias por llamar\" ni \"¿en qué le puedo ayudar?\": la llamada la " +
        "hiciste tú. Breve y natural, sin markdown."
    : "\n\nAcabas de contestar el teléfono. Saluda al cliente ahora mismo, breve y natural, siguiendo tus instrucciones. No uses markdown.";
}

export function saludoDeRespaldo(saliente: boolean, empresa?: string): string {
  return saliente
    ? `Hola, le llamamos de ${empresa ?? "nuestra empresa"}. ¿Tiene un momento?`
    : "Gracias por llamar, ¿en qué le puedo ayudar?";
}

export async function generarSaludoInicial(systemPrompt: string, saliente = false, empresa?: string): Promise<string> {
  try {
    const respuesta = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 150,
      messages: [{ role: "system", content: systemPrompt + instruccionDeSaludo(saliente) }],
    });
    return respuesta.choices[0].message.content?.trim() || saludoDeRespaldo(saliente, empresa);
  } catch (err) {
    console.error("Error generando saludo inicial:", err);
    return saludoDeRespaldo(saliente, empresa);
  }
}

export interface TurnoResultado {
  textoRespuesta: string;
  transferSolicitada?: { motivo: string };
}

/**
 * Corre un turno completo: manda el historial + el mensaje del usuario,
 * ejecuta las tool calls que hagan falta, y devuelve el texto final que
 * hay que decirle al cliente (y si hubo que transferir).
 */
export async function correrTurno(opts: {
  systemPrompt: string;
  historial: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  callSid: string;
}): Promise<TurnoResultado> {
  const { systemPrompt, historial, callSid } = opts;
  let transferSolicitada: TurnoResultado["transferSolicitada"];

  // Loop de tool-use: el modelo puede pedir varias herramientas antes de dar
  // la respuesta de texto final que hay que hablarle al cliente.
  for (let iteracion = 0; iteracion < 4; iteracion++) {
    // 220 en vez de 512: en una llamada las respuestas deben ser cortas de
    // todas formas (nadie quiere un párrafo largo leído en voz alta), y
    // menos tokens por generar = respuesta más rápida — esto le pega
    // directo a la sensación de "el bot tarda en responder".
    const respuesta = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 220,
      messages: [{ role: "system", content: systemPrompt }, ...historial],
      tools: TOOLS,
    });

    const mensaje = respuesta.choices[0].message;
    historial.push(mensaje);

    const toolCalls = mensaje.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return { textoRespuesta: (mensaje.content ?? "").trim(), transferSolicitada };
    }

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") continue;
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(toolCall.function.arguments);
      } catch {
        // argumentos mal formados del modelo; seguimos con input vacío
      }

      // Si ejecutarTool tira una excepción (falla de red hacia el backend,
      // etc.) SIN este try/catch, se perdía todo el turno: la excepción
      // subía sin control y el cliente se quedaba sin ninguna respuesta —
      // justo cuando acababa de dar un dato (registrar_dato es la
      // herramienta que más se llama, así que era el momento más común para
      // que pasara). Ahora un fallo de la herramienta se le informa al
      // modelo como resultado (puede disculparse y seguir) en vez de
      // tumbar el turno completo.
      let resultado: Awaited<ReturnType<typeof ejecutarTool>>;
      try {
        resultado = await ejecutarTool(callSid, toolCall.function.name, input);
      } catch (err) {
        console.error(`[${callSid}] Error ejecutando tool "${toolCall.function.name}":`, err);
        resultado = { resultText: "Error técnico guardando esto — discúlpate brevemente y continúa la conversación." };
      }
      if (resultado.transferSolicitada) transferSolicitada = resultado.transferSolicitada;

      historial.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: resultado.resultText,
      });
    }
  }

  return {
    textoRespuesta: "Perdón, tuve un problema procesando eso. ¿Puedes repetirlo?",
    transferSolicitada,
  };
}

/** Zona horaria en la que se interpretan frases como "mañana a las 3" (la de la empresa; por defecto República Dominicana). */
function zonaSeguimiento(): string {
  return process.env.SEGUIMIENTO_TZ ?? process.env.REPORTES_TZ ?? "America/Santo_Domingo";
}

/** "2026-10-30T14:05 (viernes)" en la zona dada. */
function horaLocal(fecha: Date, zona: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(fecha)
      .map((x) => [x.type, x.value])
  );
  const dia = new Intl.DateTimeFormat("es", { timeZone: zona, weekday: "long" }).format(fecha);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute} (${dia})`;
}

export interface ResumenLlamada {
  motivo: string;
  solicitud: string;
  resultado: string;
  accionPendiente: string;
  /** Hora local (YYYY-MM-DDTHH:MM, en `seguimientoZona`) a la que el cliente pidió que lo vuelvan a llamar; vacío si no pidió nada. */
  seguimientoFecha: string;
  seguimientoZona: string;
  satisfaccion: "positiva" | "neutral" | "negativa" | null;
}

/**
 * Genera el resumen estructurado al colgar. Es una llamada aparte (no reusa
 * el historial de la conversación) para no arrastrar el contexto de
 * herramientas y mantener la salida estrictamente JSON.
 */
export async function generarResumen(
  turnos: { hablante: string; texto: string }[],
  nombreEmpresa: string
): Promise<ResumenLlamada | null> {
  const zona = zonaSeguimiento();
  const ahoraLocal = horaLocal(new Date(), zona);
  const transcripcionPlano = turnos.map((t) => `${t.hablante}: ${t.texto}`).join("\n");

  try {
    const respuesta = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `Resumes llamadas telefónicas de atención al cliente de "${nombreEmpresa}". Responde ÚNICAMENTE con un ` +
            'objeto JSON con las claves "motivo", "solicitud", "resultado", "accionPendiente" (string cada una, ' +
            'en español, una frase corta), "seguimientoFecha" (string, ver abajo) y "satisfaccion" ("positiva", ' +
            '"neutral" o "negativa").\n\n' +
            `Para "seguimientoFecha": la fecha y hora actual es ${ahoraLocal} (zona ${zona}). Si el CLIENTE pidió o ` +
            'aceptó que lo vuelvan a llamar o contactar más adelante (ej. "llámame más tarde", "mañana en la tarde", ' +
            '"la próxima semana", "después del almuerzo", "el lunes a las 3"), calcula CUÁNDO y responde esa fecha y ' +
            'hora local con formato exacto YYYY-MM-DDTHH:MM (sin zona ni segundos). Reglas: "más tarde" o "en un rato" ' +
            '= dentro de 2 horas; "mañana" sin hora = mañana 10:00; "en la tarde" = 15:00; "en la mañana" = ' +
            '10:00; "la próxima semana" = el lunes siguiente 10:00; "después del almuerzo" = 14:00. Nunca ' +
            'propongas una hora fuera de 08:00-18:00 ni anterior a la actual. Si el cliente NO pidió que lo ' +
            'contacten de nuevo (o ya quedó resuelto, o rechazó), usa "" — nunca inventes un seguimiento.\n\n' +
            "REGLA ESTRICTA: básate solo en lo que literalmente dice la transcripción. Si la llamada es muy corta, " +
            "ambigua, o no queda claro el motivo real, usa \"\" (string vacío) en ese campo — NUNCA inventes un " +
            "tema, industria o necesidad que no esté explícitamente en el texto. Una sola palabra ambigua del " +
            "cliente (ej. un saludo, una interjección) no es motivo suficiente para inferir un tema completo.\n\n" +
            'Para "satisfaccion": clasifica el TONO del cliente tal como se ve en el texto (quejas, frustración o ' +
            'palabras negativas = "negativa"; agradecimiento, acuerdo o resolución clara = "positiva"; todo lo ' +
            'demás, incluida una llamada demasiado corta para saber = "neutral"). No la infieras del resultado de ' +
            "la llamada si el cliente no expresó nada — usa \"neutral\" por defecto.",
        },
        { role: "user", content: `Transcripción:\n${transcripcionPlano}` },
      ],
    });

    const texto = respuesta.choices[0].message.content;
    if (!texto) return null;

    const json = JSON.parse(texto);
    const satisfaccionesValidas = ["positiva", "neutral", "negativa"];
    return {
      motivo: json.motivo ?? "",
      solicitud: json.solicitud ?? "",
      resultado: json.resultado ?? "",
      accionPendiente: json.accionPendiente ?? "",
      seguimientoFecha: typeof json.seguimientoFecha === "string" ? json.seguimientoFecha.trim() : "",
      seguimientoZona: zona,
      satisfaccion: satisfaccionesValidas.includes(json.satisfaccion) ? json.satisfaccion : null,
    };
  } catch (err) {
    console.error("Error generando resumen de llamada:", err);
    return null;
  }
}
