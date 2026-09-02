/**
 * Helpers para construir respuestas TwiML sin depender de todo el SDK de Twilio
 * en el hot path del webhook. Fase 0: solo lo mínimo para grabar + conectar
 * el audio al servidor de voz IA por WebSocket (ConversationRelay).
 */

export function twimlConnectVoiceAgent(opts: {
  voiceWsUrl: string;
  empresaId: string;
  callSid: string;
  voz?: string | null;
  campanaContactoId?: string | null;
  publicBaseUrl: string;
}): string {
  const { voiceWsUrl, empresaId, callSid, voz, campanaContactoId, publicBaseUrl } = opts;

  // El atributo voice de ConversationRelay elige la voz TTS (ej. un id de
  // Google/Amazon Polly). Si la empresa no eligió ninguna, se omite y
  // Twilio usa su voz por defecto.
  const vozAttr = voz ? ` voice="${voz}"` : "";

  // Si la llamada viene de una campaña, el voice-server la usa para pedir
  // el guion combinado (empresa + guion_override de la campaña).
  const parametroCampana = campanaContactoId
    ? `\n      <Parameter name="campanaContactoId" value="${campanaContactoId}" />`
    : "";

  // <Record> deja constancia de la llamada completa; <Connect><ConversationRelay>
  // entrega el audio como texto por WebSocket a nuestro servidor de voz IA.
  // Cuando el voice-server manda {"type":"end"}, ConversationRelay termina y
  // TwiML cae al siguiente verbo: <Redirect> a post-relay, que decide si
  // hay que marcar humano (transferir_a_humano) o simplemente colgar.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Recording recordingStatusCallback="${publicBaseUrl}/webhooks/twilio/recording-status" />
  </Start>
  <Connect>
    <ConversationRelay url="${voiceWsUrl}"${vozAttr}>
      <Parameter name="empresaId" value="${empresaId}" />
      <Parameter name="callSid" value="${callSid}" />${parametroCampana}
    </ConversationRelay>
  </Connect>
  <Redirect method="POST">${publicBaseUrl}/webhooks/twilio/post-relay</Redirect>
</Response>`;
}

export function twimlDialHumano(numeroTransferencia: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>${numeroTransferencia}</Dial>
</Response>`;
}

// "Llamada normal": el cliente contesta y se conecta directo con un humano
// (el número de transferencia), sin que la IA participe en la conversación.
// Se graba igual, por la misma constancia que cualquier otra llamada.
export function twimlLlamadaNormal(opts: { numeroTransferencia: string; publicBaseUrl: string }): string {
  const { numeroTransferencia, publicBaseUrl } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Recording recordingStatusCallback="${publicBaseUrl}/webhooks/twilio/recording-status" />
  </Start>
  <Dial>${numeroTransferencia}</Dial>
</Response>`;
}

export function twimlColgar(mensaje?: string): string {
  const say = mensaje ? `<Say language="es-MX">${mensaje}</Say>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say}
  <Hangup/>
</Response>`;
}
