import type Anthropic from "@anthropic-ai/sdk";
import { marcarTransferencia, registrarSolicitud } from "./backend-client.js";

/**
 * Herramientas que el LLM puede invocar durante la llamada. Mantenerlas
 * pocas y claras: cada una es una acción real sobre la base de datos o
 * sobre el control de la llamada, no un adorno del prompt.
 */
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "transferir_a_humano",
    description:
      "Transfiere la llamada a un agente humano. Úsala solo cuando el cliente lo pida explícitamente, " +
      "esté molesto/insatisfecho, o el caso esté fuera de lo que el guion cubre. " +
      "Después de llamarla, despídete brevemente porque la llamada va a transferirse.",
    input_schema: {
      type: "object",
      properties: {
        numero_transferencia: {
          type: "string",
          description: "Número al que transferir, tomado de la lista de números de transferencia de la empresa.",
        },
        motivo: {
          type: "string",
          description: "Motivo breve de la transferencia, para que el humano tenga contexto.",
        },
      },
      required: ["numero_transferencia", "motivo"],
    },
  },
  {
    name: "registrar_solicitud",
    description:
      "Registra lo que el cliente pidió durante la llamada (cotización, reclamo, cita, información, etc.). " +
      "Llámala en cuanto identifiques con claridad qué necesita el cliente, no esperes a que termine la llamada.",
    input_schema: {
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
];

export interface ToolExecutionResult {
  resultText: string;
  transferSolicitada?: { numero: string; motivo: string };
}

export async function ejecutarTool(
  callSid: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolExecutionResult> {
  switch (toolName) {
    case "transferir_a_humano": {
      const numero = String(input.numero_transferencia ?? "");
      const motivo = String(input.motivo ?? "");
      if (!numero) {
        return { resultText: "Error: falta numero_transferencia." };
      }
      await marcarTransferencia(callSid, numero);
      return {
        resultText: `Transferencia marcada hacia ${numero}.`,
        transferSolicitada: { numero, motivo },
      };
    }

    case "registrar_solicitud": {
      const tipo = input.tipo ? String(input.tipo) : undefined;
      const descripcion = input.descripcion ? String(input.descripcion) : undefined;
      await registrarSolicitud(callSid, { tipo, descripcion });
      return { resultText: "Solicitud registrada." };
    }

    default:
      return { resultText: `Herramienta desconocida: ${toolName}` };
  }
}
