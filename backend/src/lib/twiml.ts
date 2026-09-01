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
</Response>`;
}

export function twimlDialHumano(numeroTransferencia: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>${numeroTransferencia}</Dial>
</Response>`;
}
