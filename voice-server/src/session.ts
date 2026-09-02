import type OpenAI from "openai";
import { construirSystemPrompt, correrTurno, generarResumen } from "./llm.js";
import { getEmpresaConfig, guardarTranscripcion } from "./backend-client.js";
import type { EmpresaConfig, TurnoConversacion } from "./types.js";

/**
 * Estado de una llamada mientras dura la conexión WebSocket con
 * ConversationRelay. Vive en memoria — una instancia por llamada, se
 * descarta al colgar. Nada de esto es constancia todavía; la constancia
 * real es la grabación + lo que se guarda en Postgres al final.
 */
export class ConversationSession {
  private historial: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
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
   * Al terminar la llamada: genera el resumen (motivo/solicitud/resultado/
   * acción pendiente) con una llamada aparte al LLM y guarda todo junto con
   * la transcripción cruda en Postgres. Si el resumen falla, igual se
   * guarda la transcripción — la constancia no debe depender del resumen.
   */
  async finalizar() {
    if (this.turnos.length === 0) return;

    const resumen = await generarResumen(this.turnos);

    await guardarTranscripcion(this.callSid, {
      textoCompleto: this.turnos,
      resumenMotivo: resumen?.motivo,
      resumenSolicitud: resumen?.solicitud,
      resumenResultado: resumen?.resultado,
      accionPendiente: resumen?.accionPendiente,
    }).catch((err) => {
      console.error(`[${this.callSid}] error guardando transcripción:`, err);
    });
  }
}
