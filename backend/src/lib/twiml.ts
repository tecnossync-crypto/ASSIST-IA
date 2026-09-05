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
  ttsProvider?: string | null;
  campanaContactoId?: string | null;
  webhookLlamadaId?: string | null;
  publicBaseUrl: string;
}): string {
  const { voiceWsUrl, empresaId, callSid, voz, ttsProvider, campanaContactoId, webhookLlamadaId, publicBaseUrl } =
    opts;

  // ConversationRelay necesita "ttsProvider" y "voice" como atributos
  // SEPARADOS (ej. ttsProvider="amazon" voice="Pedro-Neural") — un solo
  // string mezclado no es válido para Twilio. Si falta cualquiera de los
  // dos, se omiten ambos y Twilio usa su voz por defecto.
  const vozAttr = voz && ttsProvider ? ` ttsProvider="${ttsProvider}" voice="${voz}"` : "";

  // Si la llamada viene de una campaña, el voice-server la usa para pedir
  // el guion combinado (empresa + guion_override de la campaña). Si viene
  // de un webhook externo (Configuración → Integraciones → API), pide el
  // guion con el prompt que mandó esa plataforma.
  const parametroCampana = campanaContactoId
    ? `\n      <Parameter name="campanaContactoId" value="${campanaContactoId}" />`
    : "";
  const parametroWebhook = webhookLlamadaId
    ? `\n      <Parameter name="webhookLlamadaId" value="${webhookLlamadaId}" />`
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
      <Parameter name="callSid" value="${callSid}" />${parametroCampana}${parametroWebhook}
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
// SIN salir de la plataforma. En vez de <Dial><Client> directo (que bridgea
// las dos piernas sin dejar forma de meter a un tercero), el cliente entra a
// una CONFERENCIA de Twilio y espera ahí — así el admin puede unirse después
// a escuchar/intervenir (ver lib/agentes.ts + routes/monitoreo.ts). El
// agente se marca por separado con una llamada REST a
// /webhooks/twilio/conferencia-agente, que lo mete a la misma conferencia.
// startConferenceOnEnter=false: el cliente espera en silencio hasta que un
// agente entre y la arranque de verdad.
export function twimlEsperarConferencia(opts: { conferenciaNombre: string; publicBaseUrl: string }): string {
  const { conferenciaNombre, publicBaseUrl } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Recording recordingStatusCallback="${publicBaseUrl}/webhooks/twilio/recording-status" />
  </Start>
  <Dial>
    <Conference
      startConferenceOnEnter="false"
      endConferenceOnExit="false"
      statusCallbackEvent="start end join leave"
      statusCallback="${publicBaseUrl}/webhooks/twilio/conferencia-evento"
    >${conferenciaNombre}</Conference>
  </Dial>
</Response>`;
}

// TwiML que responde cada pierna de agente que se marca por REST (ver
// routes/webhooks-twilio.ts). El primero que conteste arranca la conferencia
// (startConferenceOnEnter=true) y si se sale, la conferencia termina para
// todos (endConferenceOnExit=true) — así se comporta igual que colgar en un
// <Dial> normal.
export function twimlUnirseConferenciaComoAgente(opts: { conferenciaNombre: string; publicBaseUrl: string }): string {
  const { conferenciaNombre, publicBaseUrl } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      statusCallbackEvent="start end join leave"
      statusCallback="${publicBaseUrl}/webhooks/twilio/conferencia-evento"
    >${conferenciaNombre}</Conference>
  </Dial>
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
