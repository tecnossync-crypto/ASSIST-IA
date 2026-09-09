/**
 * Mensajes del protocolo Twilio ConversationRelay.
 * Twilio ya hizo el STT/TTS; aquí solo llega/sale texto por WebSocket.
 * Referencia: twilio.com/docs/voice/twiml/connect/conversationrelay
 */

export type ConversationRelayIncoming =
  | {
      type: "setup";
      callSid: string;
      from: string;
      to: string;
      customParameters?: Record<string, string>;
    }
  | {
      type: "prompt";
      voicePrompt: string;
      lang?: string;
      last?: boolean;
    }
  | {
      type: "interrupt";
      utteranceUntilInterrupt?: string;
      durationUntilInterruptMs?: number;
    }
  | {
      type: "dtmf";
      digit: string;
    };

export type ConversationRelayOutgoing =
  | { type: "text"; token: string; last: boolean }
  | { type: "end"; handoffData?: string };

export interface EmpresaConfig {
  nombre: string;
  guion_agente: {
    // Si la empresa escribe su propio prompt completo, este campo manda y
    // los campos guiados de abajo se ignoran (siguen existiendo por si la
    // empresa prefiere el modo guiado en vez de escribir el prompt a mano).
    prompt_personalizado?: string;
    saludo?: string;
    que_resuelve?: string;
    datos_a_tomar?: string[];
    cuando_transferir?: string;
    instrucciones_extra?: string;
  };
  horario_atencion?: Record<string, unknown>;
  campos_personalizados?: { nombre: string; descripcion?: string }[];
  duracion_maxima_llamada_segundos?: number;
  tiempo_respuesta_segundos?: number;
  // Departamentos/colas configurados (Configuración → Agentes) — el bot
  // puede elegir a cuál transferir según de qué se trate la llamada.
  colas?: { id: string; nombre: string }[];
  // Si ya conocemos a este cliente (llamada a/de un número ya guardado en
  // Contactos), lo que ya sabemos de él — para que el bot lo salude por su
  // nombre y NO vuelva a pedir datos que ya tiene (ver construirSystemPrompt
  // en llm.ts). null si es la primera vez que hablamos con este número.
  contacto_conocido?: { nombre: string | null; apellido: string | null; datos: Record<string, string> } | null;
}

export interface TurnoConversacion {
  hablante: "agente" | "cliente";
  texto: string;
  timestamp: string;
}
