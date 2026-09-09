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
        "Transfiere la llamada EN VIVO, ahora mismo, a un agente humano disponible — el cliente se queda " +
        "esperando en línea hasta que alguien conteste. Úsala SOLO cuando de verdad haga falta que un humano " +
        "hable con el cliente en este momento: lo pide explícitamente, está molesto/insatisfecho, es urgente, o " +
        "el caso está fuera de lo que el guion cubre y no lo puedes resolver ni registrar bien. " +
        "Para pedidos normales que se pueden gestionar después (pagos, cotizaciones, información, cambios, " +
        "reclamos no urgentes, etc.) usa registrar_solicitud en vez de esta — NO hace falta transferir en vivo " +
        "para eso. Después de llamar a esta herramienta, despídete brevemente porque la llamada va a " +
        "transferirse.",
      parameters: {
        type: "object",
        properties: {
          motivo: {
            type: "string",
            description: "Motivo breve de la transferencia, para que el humano tenga contexto.",
          },
          colaId: {
            type: "string",
            description:
              "El id EXACTO (no el nombre) del departamento al que corresponde transferir, tomado de la lista " +
              "de departamentos disponibles en tus instrucciones. Si no hay uno claramente indicado para este " +
              "caso, o solo hay uno configurado, omite este campo — se reparte entre todos los agentes.",
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
        "Guarda lo que el cliente pidió (pago, cotización, reclamo, información, cambio en su póliza, cita, " +
        "etc.) para que un gestor lo retome DESPUÉS — sin transferir la llamada en vivo. Esta es la opción por " +
        "defecto para casi cualquier pedido del cliente: en cuanto identifiques con claridad qué necesita, " +
        "regístralo con esta herramienta y avísale que un gestor se va a comunicar con él/ella para continuar " +
        "(dilo en tu respuesta, en tus propias palabras). Usa transferir_a_humano en cambio SOLO si de verdad " +
        "hace falta un humano ahora mismo. No esperes a que termine la llamada para llamar a esta herramienta.",
      parameters: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            description: "Categoría corta: cotizacion | reclamo | pago | cita | informacion | otro",
          },
          descripcion: {
            type: "string",
            description: "Qué pidió el cliente, en una o dos frases.",
          },
          colaId: {
            type: "string",
            description:
              "El id EXACTO (no el nombre) del departamento al que corresponde este pedido, tomado de la lista " +
              "de departamentos disponibles en tus instrucciones. Si no hay uno claramente indicado, o solo hay " +
              "uno configurado, omite este campo.",
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
      const colaId = input.colaId ? String(input.colaId) : undefined;
      // A qué agente cae la llamada dentro de esa cola lo decide el
      // enrutamiento configurado (round_robin, por disponibilidad, etc.) en
      // el momento — ver post-relay en el backend. colaId es opcional: si
      // el modelo no lo manda (o manda un id que no existe/es de otra
      // empresa), el backend simplemente lo ignora y reparte entre todos.
      await marcarTransferencia(callSid, colaId);
      return {
        resultText: "Transferencia marcada.",
        transferSolicitada: { motivo },
      };
    }

    case "registrar_solicitud": {
      const tipo = input.tipo ? String(input.tipo) : undefined;
      const descripcion = input.descripcion ? String(input.descripcion) : undefined;
      const colaId = input.colaId ? String(input.colaId) : undefined;
      await registrarSolicitud(callSid, { tipo, descripcion, colaId });
      return {
        resultText:
          "Solicitud registrada. Dile ahora al cliente, en tus propias palabras, que un gestor se va a comunicar " +
          "con él/ella para continuar con esto — no transfieras la llamada para esto.",
      };
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
