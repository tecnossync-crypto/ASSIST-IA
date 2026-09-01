/**
 * Helpers para construir respuestas TwiML sin depender de todo el SDK de Twilio
 * en el hot path del webhook. Fase 0: solo lo mínimo para grabar + conectar
 * el audio al servidor de voz IA por WebSocket (ConversationRelay).
 */

export function twimlConnectVoiceAgent(opts: {
  voiceWsUrl: string;
  empresaId: string;
  callSid: string;
}): string {
  const { voiceWsUrl, empresaId, callSid } = opts;

  // <Record> deja constancia de la llamada completa; <Connect><ConversationRelay>
  // entrega el audio como texto por WebSocket a nuestro servidor de voz IA.
  // Cuando el voice-server manda {"type":"end"}, ConversationRelay termina y
  // TwiML cae al siguiente verbo: <Redirect> a post-relay, que decide si
  // hay que marcar humano (transferir_a_humano) o simplemente colgar.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Recording recordingStatusCallback="/webhooks/twilio/recording-status" />
  </Start>
  <Connect>
    <ConversationRelay url="${voiceWsUrl}">
      <Parameter name="empresaId" value="${empresaId}" />
      <Parameter name="callSid" value="${callSid}" />
    </ConversationRelay>
  </Connect>
  <Redirect method="POST">/webhooks/twilio/post-relay</Redirect>
</Response>`;
}

export function twimlDialHumano(numeroTransferencia: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
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
