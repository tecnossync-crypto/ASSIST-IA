import OpenAI from "openai";
import { TOOLS, ejecutarTool } from "./tools.js";
import type { EmpresaConfig } from "./types.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  const numeros = empresa.numeros_transferencia?.join(", ") || "(ninguno configurado)";

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

  return [
    base,
    `Números de transferencia disponibles: ${numeros}.`,
    "Usa la herramienta registrar_solicitud en cuanto identifiques qué necesita el cliente.",
    "Usa la herramienta transferir_a_humano solo cuando corresponda según las reglas de arriba.",
    "Nunca inventes información que no tengas; si no sabes algo, dilo y ofrece transferir.",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface TurnoResultado {
  textoRespuesta: string;
  transferSolicitada?: { numero: string; motivo: string };
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
    const respuesta = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 512,
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

      const resultado = await ejecutarTool(callSid, toolCall.function.name, input);
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

export interface ResumenLlamada {
  motivo: string;
  solicitud: string;
  resultado: string;
  accionPendiente: string;
}

/**
 * Genera el resumen estructurado al colgar. Es una llamada aparte (no reusa
 * el historial de la conversación) para no arrastrar el contexto de
 * herramientas y mantener la salida estrictamente JSON.
 */
export async function generarResumen(turnos: { hablante: string; texto: string }[]): Promise<ResumenLlamada | null> {
  const transcripcionPlano = turnos.map((t) => `${t.hablante}: ${t.texto}`).join("\n");

  try {
    const respuesta = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Resumes llamadas telefónicas de atención al cliente. Responde ÚNICAMENTE con un objeto JSON " +
            'con las claves "motivo", "solicitud", "resultado" y "accionPendiente" (string cada una, en español, ' +
            'una frase corta). Si no aplica algo, usa "" (string vacío).',
        },
        { role: "user", content: `Transcripción:\n${transcripcionPlano}` },
      ],
    });

    const texto = respuesta.choices[0].message.content;
    if (!texto) return null;

    const json = JSON.parse(texto);
    return {
      motivo: json.motivo ?? "",
      solicitud: json.solicitud ?? "",
      resultado: json.resultado ?? "",
      accionPendiente: json.accionPendiente ?? "",
    };
  } catch (err) {
    console.error("Error generando resumen de llamada:", err);
    return null;
  }
}
