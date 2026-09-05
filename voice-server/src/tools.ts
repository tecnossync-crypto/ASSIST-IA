import type OpenAI from "openai";
import { marcarTransferencia, registrarSolicitud, registrarDato } from "./backend-client.js";

/**
 * Herramientas que el LLM puede invocar durante la llamada. Mantenerlas
 * pocas y claras: cada una es una acción real sobre la base de datos o
 * sobre el control de la llamada, no un adorno del prompt.
 */
export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "transferir_a_humano",
      description:
        "Transfiere la llamada a un agente humano disponible. Úsala solo cuando el cliente lo pida " +
        "explícitamente, esté molesto/insatisfecho, o el caso esté fuera de lo que el guion cubre. " +
        "Después de llamarla, despídete brevemente porque la llamada va a transferirse.",
      parameters: {
        type: "object",
        properties: {
          motivo: {
            type: "string",
            description: "Motivo breve de la transferencia, para que el humano tenga contexto.",
          },
        },
        required: ["motivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_solicitud",
      description:
        "Registra lo que el cliente pidió durante la llamada (cotización, reclamo, cita, información, etc.). " +
        "Llámala en cuanto identifiques con claridad qué necesita el cliente, no esperes a que termine la llamada.",
      parameters: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            description: "Categoría corta: cotizacion | reclamo | cita | informacion | otro",
          },
          descripcion: {
            type: "string",
            description: "Qué pidió el cliente, en una o dos frases.",
          },
        },
        required: ["tipo", "descripcion"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_dato",
      description:
        "Guarda un dato específico que la empresa configuró recolectar (ver la lista de campos en tus instrucciones). " +
        "Llámala una vez por cada campo en cuanto el cliente te lo dé, no esperes a tener todos.",
      parameters: {
        type: "object",
        properties: {
          campo: {
            type: "string",
            description: "Nombre exacto del campo, tal como aparece en la lista de campos a recolectar.",
          },
          valor: {
            type: "string",
            description: "Lo que dijo el cliente para ese campo.",
          },
        },
        required: ["campo", "valor"],
      },
    },
  },
];

export interface ToolExecutionResult {
  resultText: string;
  transferSolicitada?: { motivo: string };
}

export async function ejecutarTool(
  callSid: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolExecutionResult> {
  switch (toolName) {
    case "transferir_a_humano": {
      const motivo = String(input.motivo ?? "");
      // Ya no se le pide un número al bot: a qué agente cae la llamada lo
      // decide el enrutamiento de la cola/empresa (round_robin, por
      // disponibilidad, etc.) en el momento — ver post-relay en el backend.
      await marcarTransferencia(callSid);
      return {
        resultText: "Transferencia marcada.",
        transferSolicitada: { motivo },
      };
    }

    case "registrar_solicitud": {
      const tipo = input.tipo ? String(input.tipo) : undefined;
      const descripcion = input.descripcion ? String(input.descripcion) : undefined;
      await registrarSolicitud(callSid, { tipo, descripcion });
      return { resultText: "Solicitud registrada." };
    }

    case "registrar_dato": {
      const campo = String(input.campo ?? "");
      const valor = String(input.valor ?? "");
      if (!campo || !valor) {
        return { resultText: "Error: faltan campo o valor." };
      }
      await registrarDato(callSid, campo, valor);
      return { resultText: `Dato "${campo}" registrado.` };
    }

    default:
      return { resultText: `Herramienta desconocida: ${toolName}` };
  }
}
