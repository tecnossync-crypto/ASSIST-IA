import type Anthropic from "@anthropic-ai/sdk";
import { construirSystemPrompt, correrTurno } from "./llm.js";
import { getEmpresaConfig, guardarTranscripcion } from "./backend-client.js";
import type { EmpresaConfig, TurnoConversacion } from "./types.js";

/**
 * Estado de una llamada mientras dura la conexión WebSocket con
 * ConversationRelay. Vive en memoria — una instancia por llamada, se
 * descarta al colgar. Nada de esto es constancia todavía; la constancia
 * real es la grabación + lo que se guarda en Postgres al final.
 */
export class ConversationSession {
  private historial: Anthropic.MessageParam[] = [];
  private turnos: TurnoConversacion[] = [];
  private systemPrompt = "";
  private empresa: EmpresaConfig | null = null;

  constructor(
    public readonly callSid: string,
    public readonly empresaId: string
  ) {}

  async inicializar() {
    this.empresa = await getEmpresaConfig(this.empresaId);
    this.systemPrompt = construirSystemPrompt(this.empresa);
  }

  saludoInicial(): string {
    return this.empresa?.guion_agente?.saludo || `Gracias por llamar a ${this.empresa?.nombre ?? "nuestra empresa"}, ¿en qué le puedo ayudar?`;
  }

  registrarTurnoAgente(texto: string) {
    this.turnos.push({ hablante: "agente", texto, timestamp: new Date().toISOString() });
  }

  /**
   * Procesa lo que dijo el cliente y devuelve el texto que el agente debe
   * responder (y si hay que transferir, el número destino).
   */
  async procesarMensajeCliente(voicePrompt: string) {
    this.turnos.push({ hablante: "cliente", texto: voicePrompt, timestamp: new Date().toISOString() });
    this.historial.push({ role: "user", content: voicePrompt });

    const resultado = await correrTurno({
      systemPrompt: this.systemPrompt,
      historial: this.historial,
      callSid: this.callSid,
    });

    if (resultado.textoRespuesta) {
      this.registrarTurnoAgente(resultado.textoRespuesta);
    }

    return resultado;
  }

  /**
   * Al terminar la llamada: guarda la transcripción cruda en Postgres.
   * El resumen (motivo/solicitud/resultado) queda como TODO explícito para
   * no fingir un análisis que no se hizo — se puede llamar a un LLM aparte
   * en un job posterior en vez de bloquear el cierre de la llamada.
   */
  async finalizar() {
    if (this.turnos.length === 0) return;
    await guardarTranscripcion(this.callSid, { textoCompleto: this.turnos }).catch((err) => {
      console.error(`[${this.callSid}] error guardando transcripción:`, err);
    });
  }
}
