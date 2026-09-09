/**
 * Helpers para construir respuestas TwiML sin depender de todo el SDK de Twilio
 * en el hot path del webhook. Fase 0: solo lo mínimo para grabar + conectar
 * el audio al servidor de voz IA por WebSocket (ConversationRelay).
 */

export function twimlConnectVoiceAgent(opts: {
  voiceWsUrl: string;
  empresaId: string;
  callSid: string;
  numeroCliente?: string | null;
  voz?: string | null;
  ttsProvider?: string | null;
  campanaContactoId?: string | null;
  webhookLlamadaId?: string | null;
  publicBaseUrl: string;
}): string {
  const {
    voiceWsUrl,
    empresaId,
    callSid,
    numeroCliente,
    voz,
    ttsProvider,
    campanaContactoId,
    webhookLlamadaId,
    publicBaseUrl,
  } = opts;

  // ConversationRelay necesita "ttsProvider" y "voice" como atributos
  // SEPARADOS (ej. ttsProvider="amazon" voice="Pedro-Neural") — un solo
  // string mezclado no es válido para Twilio. Si la empresa no configuró
  // ninguno de los dos, se usa un default en español (Google es-MX) en vez
  // de dejarlo vacío: según la documentación de Twilio, "Conversation Relay
  // sends an error message ... and disconnects the call when you've
  // specified an invalid combination of ... ttsProvider and voice" — con
  // language="es-MX" puesto (ver abajo) pero SIN voz/ttsProvider, Twilio caía
  // en un combo por defecto incompatible: contestaba con un mensaje de error
  // en inglés y colgaba a los pocos segundos. Con un default explícito en
  // español, esa combinación siempre es válida.
  // "es-MX-Neural2-A" (el default que se puso antes) probablemente no existe
  // como voz real de Google — el mismo error seguía pasando. Se usa
  // "es-US-Neural2-A", que es la MISMA voz ya verificada y ofrecida como
  // primera opción del catálogo en Configuración → IA (components/SelectorVoz.tsx).
  //
  // OTRO bug encontrado: el catálogo (SelectorVoz.tsx) guarda el proveedor
  // en minúscula ("google", "amazon", "elevenlabs"), pero Twilio documenta
  // los valores válidos de ttsProvider como "Google" / "Amazon" /
  // "ElevenLabs" (con mayúscula). Con la minúscula, Twilio no tira ningún
  // error de validación al armar la llamada — pero la síntesis de voz
  // fallaba en silencio: el texto se generaba bien (se veía en los logs) y
  // nunca se escuchaba nada, ni el saludo inicial. Se normaliza acá,
  // sin importar cómo haya quedado guardado en la base.
  const PROVEEDORES_TTS: Record<string, string> = { google: "Google", amazon: "Amazon", elevenlabs: "ElevenLabs" };
  const ttsProviderFinal = PROVEEDORES_TTS[(ttsProvider || "google").toLowerCase()] ?? "Google";
  const vozFinal = voz || "es-US-Neural2-A";
  const vozAttr = ` ttsProvider="${ttsProviderFinal}" voice="${vozFinal}"`;

  // Sin esto, Twilio reconoce lo que dice el cliente asumiendo inglés
  // (en-US) por defecto — con un cliente hablando español, la transcripción
  // sale vacía o basura y el bot nunca recibe nada que responder (se queda
  // "esperando" aunque el cliente sí esté hablando). es-MX cubre bien
  // español latinoamericano en general.
  //
  // EL ERROR REAL (confirmado con el código 64101 de Twilio, ver Notifications
  // de la llamada): "Incomplete value set in TwiML for language es-MX,
  // ttsProvider/voice and transcriptionProvider/speechModel are all needed".
  // O sea: en cuanto se pone `language`, Twilio EXIGE los 4 atributos juntos
  // (ttsProvider+voice para hablar, transcriptionProvider+speechModel para
  // entender) — faltaban estos dos últimos, por eso la llamada seguía
  // fallando con los fixes anteriores (esos solo cubrían ttsProvider/voice).
  const idiomaAttr = ` language="es-MX" transcriptionProvider="Google" speechModel="telephony"`;

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
  // El voice-server se lo pasa al backend al pedir el guion, para que
  // pueda mapear {{variables}} del prompt con los datos reales del
  // contacto (si ya lo conocemos) — ver /internal/*/config-agente.
  const parametroNumeroCliente = numeroCliente
    ? `\n      <Parameter name="numeroCliente" value="${numeroCliente}" />`
    : "";

  // Bifurca el audio crudo (cliente + voz del bot) al mismo voice-server,
  // en un WebSocket aparte (/supervision-stream, no interfiere con
  // ConversationRelay) — así un admin puede "escuchar en vivo" una llamada
  // de IA todavía en curso con el bot, igual que ya se puede con una
  // llamada normal (ver Supervisión → escuchar-ia). <Start> es un verbo
  // aparte que no bloquea ni reemplaza al <Connect> de abajo — corren en
  // paralelo. track="both_tracks" manda el audio del cliente y del bot por
  // separado (msg.media.track), el navegador los mezcla al reproducir.
  const streamSupervisionUrl = voiceWsUrl.replace(/\/voice-stream\/?$/, "/supervision-stream");
  const parametroCallSidStream = `?callSid=${encodeURIComponent(callSid)}`;

  // <Record> deja constancia de la llamada completa; <Connect><ConversationRelay>
  // entrega el audio como texto por WebSocket a nuestro servidor de voz IA.
  // Cuando el voice-server manda {"type":"end"}, ConversationRelay termina y
  // TwiML cae al siguiente verbo: <Redirect> a post-relay, que decide si
  // hay que marcar humano (transferir_a_humano) o simplemente colgar.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Recording recordingStatusCallback="${publicBaseUrl}/webhooks/twilio/recording-status" />
    <Stream url="${streamSupervisionUrl}${parametroCallSidStream}" track="both_tracks" />
  </Start>
  <Connect>
    <ConversationRelay url="${voiceWsUrl}"${idiomaAttr}${vozAttr}>
      <Parameter name="empresaId" value="${empresaId}" />
      <Parameter name="callSid" value="${callSid}" />${parametroCampana}${parametroWebhook}${parametroNumeroCliente}
    </ConversationRelay>
  </Connect>
  <Redirect method="POST">${publicBaseUrl}/webhooks/twilio/post-relay</Redirect>
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
// endConferenceOnExit=true: si el CLIENTE cuelga (se sale de la
// conferencia), la conferencia termina para todos — así el lado del agente
// también cuelga solo, en vez de quedar "en llamada" con nadie del otro
// lado. Antes estaba en false y esa era justo la falla.
// beep="false": sin esto, Twilio reproduce un pitido audible a TODOS los que
// ya están en la conferencia cada vez que alguien más entra o sale — rompía
// justo la idea de que un admin pueda entrar a escuchar "sin ser notado"
// (ver /api/llamadas/:id/escuchar), y de paso sonaba como que algo
// interrumpía la llamada cada vez que se unía el agente.
// waitUrl: música mientras el cliente espera (antes dependía del default no
// documentado de Twilio) — mismo audio que se usa para "poner en espera"
// durante una llamada ya conectada (ver /agente/hold).
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
      endConferenceOnExit="true"
      beep="false"
      waitUrl="${publicBaseUrl}/webhooks/twilio/musica-espera"
      waitMethod="POST"
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
// <Dial> normal. beep="false": mismo motivo que arriba — evita el pitido
// cuando un admin se une a escuchar/intervenir, o cuando se trae a otro
// agente a la conferencia (transferencia entre agentes).
export function twimlUnirseConferenciaComoAgente(opts: { conferenciaNombre: string; publicBaseUrl: string }): string {
  const { conferenciaNombre, publicBaseUrl } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      beep="false"
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
