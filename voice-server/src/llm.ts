import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, ejecutarTool } from "./tools.js";
import type { EmpresaConfig } from "./types.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Modelo por defecto para el agente de voz. Ajustable por variable de
// entorno sin tocar código si se quiere probar otro tier.
const MODEL = process.env.LLM_MODEL ?? "claude-sonnet-5";

export function construirSystemPrompt(empresa: EmpresaConfig): string {
  const g = empresa.guion_agente ?? {};
  const numeros = empresa.numeros_transferencia?.join(", ") || "(ninguno configurado)";

  return [
    `Eres el agente de atención telefónica de "${empresa.nombre}". Hablas por teléfono: respuestas cortas, naturales, sin listas ni markdown.`,
    g.saludo ? `Saludo inicial sugerido: "${g.saludo}"` : "",
    g.que_resuelve ? `Qué resuelves en esta línea: ${g.que_resuelve}` : "",
    g.datos_a_tomar?.length ? `Datos que debes recolectar del cliente: ${g.datos_a_tomar.join(", ")}.` : "",
    g.cuando_transferir ? `Cuándo transferir a un humano: ${g.cuando_transferir}` : "",
    g.instrucciones_extra ?? "",
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
  historial: Anthropic.MessageParam[];
  callSid: string;
}): Promise<TurnoResultado> {
  const { systemPrompt, historial, callSid } = opts;
  let transferSolicitada: TurnoResultado["transferSolicitada"];

  // Loop de tool-use: Claude puede pedir varias herramientas antes de dar
  // la respuesta de texto final que hay que hablarle al cliente.
  for (let iteracion = 0; iteracion < 4; iteracion++) {
    const respuesta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: systemPrompt,
      tools: TOOLS,
      messages: historial,
    });

    const bloquesTexto = respuesta.content.filter((b) => b.type === "text");
    const bloquesTool = respuesta.content.filter((b) => b.type === "tool_use");

    historial.push({ role: "assistant", content: respuesta.content });

    if (bloquesTool.length === 0) {
      const texto = bloquesTexto.map((b) => (b.type === "text" ? b.text : "")).join(" ").trim();
      return { textoRespuesta: texto, transferSolicitada };
    }

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const bloque of bloquesTool) {
      if (bloque.type !== "tool_use") continue;
      const resultado = await ejecutarTool(callSid, bloque.name, bloque.input as Record<string, unknown>);
      if (resultado.transferSolicitada) transferSolicitada = resultado.transferSolicitada;
      resultados.push({
        type: "tool_result",
        tool_use_id: bloque.id,
        content: resultado.resultText,
      });
    }

    historial.push({ role: "user", content: resultados });
  }

  return {
    textoRespuesta: "Perdón, tuve un problema procesando eso. ¿Puedes repetirlo?",
    transferSolicitada,
  };
}
