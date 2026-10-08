import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";

// El .env vive en la raíz del monorepo, no en voice-server/.
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { ConversationSession } from "./session.js";
import type { ConversationRelayIncoming, ConversationRelayOutgoing } from "./types.js";
import { registrarSupervisionStream } from "./supervision-stream.js";
import { sintetizarVozElevenLabs } from "./backend-client.js";

// Red de seguridad a nivel de proceso: este servidor sostiene TODAS las
// llamadas de IA en curso en memoria (una ConversationSession por
// callSid) — sin esto, una excepción no capturada en CUALQUIER parte
// (incluidas librerías de terceros, ej. el SDK de OpenAI) tumba el
// proceso ENTERO en silencio y corta TODAS las conversaciones activas de
// golpe, no solo la que falló. Docker (restart: unless-stopped) lo
// vuelve a levantar, pero antes esto pasaba sin dejar rastro en los
// logs. Se sale del proceso en vez de seguir corriendo con estado
// posiblemente inconsistente (recomendación de Node para
// uncaughtException) — Docker lo reinicia limpio.
process.on("uncaughtException", (err) => {
  console.error("[fatal] excepción no capturada — el proceso se reinicia:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] promesa rechazada sin capturar:", reason);
});

const PORT = Number(process.env.VOICE_SERVER_PORT ?? process.env.PORT ?? 3002);

// Llamadas por la central: cuánto espera la IA a oír al cliente antes de
// saludar por su cuenta, y cuánto más antes de preguntar "¿aló?". El primer
// tiempo es largo a propósito: cubre el marcado y el timbrado (la central
// contesta primero), para no saludarle al tono de llamada.
const ESPERA_VOZ_CLIENTE_MS = Number(process.env.ESPERA_VOZ_CLIENTE_MS ?? 18000);
const ESPERA_REINTENTO_MS = Number(process.env.ESPERA_REINTENTO_MS ?? 12000);

// Audio de voz clonada (ElevenLabs) pendiente de que Twilio lo descargue —
// ver audioTemporalUrl() más abajo. En memoria nada más: son archivos de
// segundos de duración que se sirven una sola vez y se descartan; no hace
// falta persistirlos ni un storage externo (eso es justo lo que se
// eliminó — ver comentario en hablar()).
const audiosTemporales = new Map<string, Buffer>();

function audioTemporalUrl(audio: Buffer): string {
  const id = randomUUID();
  audiosTemporales.set(id, audio);
  // Red de seguridad: si por lo que sea Twilio nunca llega a pedirlo (la
  // llamada se cae antes, un error raro, etc.), esto evita que el mapa
  // crezca sin límite con audios que nadie va a reclamar.
  setTimeout(() => audiosTemporales.delete(id), 2 * 60 * 1000).unref();
  return `${process.env.PUBLIC_BASE_URL}/tts-audio/${id}`;
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "voz-ia-voice-server" }));
    return;
  }

  const match = req.url?.match(/^\/tts-audio\/([\w-]+)$/);
  if (match) {
    const audio = audiosTemporales.get(match[1]);
    console.log(`[tts-audio] método=${req.method} id=${match[1]} encontrado=${!!audio}`);
    if (!audio) {
      res.writeHead(404);
      res.end();
      return;
    }
    // Antes esto se borraba de memoria apenas se servía una vez, asumiendo
    // que Twilio solo lo pide una vez para reproducirlo. Pero si Twilio (o
    // cualquier proxy en el medio) hace una petición previa de verificación
    // (ej. un HEAD o un GET con Range para sondear el archivo antes de
    // reproducirlo), esa primera petición ya borraba el audio y la
    // reproducción real caía en un 404 silencioso — el WebSocket mostraba
    // el "play" como enviado, pero nunca sonaba nada en la llamada. Ahora
    // se deja disponible hasta que expire el timeout (2 min) de arriba,
    // sin importar cuántas veces se pida.
    res.writeHead(200, { "content-type": "audio/mpeg", "content-length": audio.length });
    res.end(audio);
    return;
  }

  res.writeHead(404);
  res.end();
});

// perMessageDeflate: false — la librería "ws" activa compresión WebSocket
// por defecto; se apaga porque no hace falta comprimir mensajes JSON tan
// chicos (esto por sí solo NO era la causa del bug de abajo, pero tampoco
// hay razón para dejarlo activo).
//
// noServer: true — CAUSA RAÍZ real de un bug confirmado en producción:
// "Invalid WebSocket frame: RSV1 must be clear" / "reserved bits must be
// 0" (confirmado con wscat, con un cliente Python independiente, e
// incluso reproducido con un servidor mínimo de 20 líneas). Antes, este
// WebSocketServer y el de supervision-stream.ts se creaban CADA UNO con
// `{ server: httpServer, path: "..." }` — eso hace que CADA instancia
// enganche su PROPIO listener al evento "upgrade" del mismo httpServer.
// Con dos instancias escuchando el mismo evento, ws se pisa el buffer del
// handshake entre sí y corrompe los frames de la conexión que sí hace
// match — Twilio (o cualquier cliente) veía la conexión abrirse y
// cortarse al instante, sin ningún mensaje intercambiado. La forma
// correcta, documentada por la propia librería "ws" para compartir un
// httpServer entre varios WebSocketServer, es usar noServer:true en cada
// uno y enganchar el evento "upgrade" UNA SOLA VEZ, despachando a mano
// según el path (ver el server.on("upgrade", ...) más abajo).
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

// Segundo WebSocket, mismo httpServer, otro path — audio en vivo para
// Supervisión (ver supervision-stream.ts). Totalmente independiente de
// ConversationRelay: si esto falla, no afecta la llamada en sí.
const wssSupervision = registrarSupervisionStream(httpServer);

// Único punto que escucha "upgrade" en todo el proceso — ver el comentario
// largo junto a `wss` de arriba sobre por qué NO se puede dejar que cada
// WebSocketServer enganche su propio listener con la opción `path`.
httpServer.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "", "http://localhost");
  if (pathname === "/voice-stream") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else if (pathname === "/supervision-stream") {
    wssSupervision.handleUpgrade(req, socket, head, (ws) => wssSupervision.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

function enviar(ws: WebSocket, mensaje: ConversationRelayOutgoing) {
  // La conexión puede haberse cerrado mientras se generaba/sintetizaba la
  // respuesta (colgó, o ya se mandó "end" antes) — intentar enviar igual
  // solo ensucia los logs con "WebSocket is not open", no hace nada útil.
  if (ws.readyState !== WebSocket.OPEN) {
    console.log(`[ws] se descarta envío, socket ya no está abierto (readyState=${ws.readyState})`);
    return;
  }
  // ws.send() puede fallar en silencio (sin tirar excepción) si la conexión
  // ya no está abierta, o emitir el error por el evento 'error' del socket
  // en vez de por una excepción normal — ninguno de los dos se veía en los
  // logs hasta ahora. Esto lo hace explícito.
  console.log(`[ws] enviando readyState=${ws.readyState} mensaje=${JSON.stringify(mensaje).slice(0, 200)}`);
  ws.send(JSON.stringify(mensaje), (err) => {
    if (err) console.error("[ws] error enviando mensaje a ConversationRelay:", err);
  });
}

/**
 * Hace que el agente "diga" un texto — decide solo si eso significa mandar
 * el texto a ConversationRelay (caso normal: Twilio lo sintetiza con Google/
 * Amazon/su catálogo de ElevenLabs) o, si la empresa tiene una voz CLONADA
 * propia, sintetizarlo nosotros mismos con la API real de ElevenLabs y
 * pedirle a Twilio que solo reproduzca ese audio ya generado ("play") — ver
 * ConversationSession.usaVozClonada() y lib/elevenlabs.ts en el backend para
 * el porqué (el ttsProvider nativo de Twilio no soporta voces privadas).
 *
 * Si la síntesis con ElevenLabs falla (cuenta sin plan que lo permita, API
 * caída, etc.), cae de vuelta al texto normal en vez de dejar al cliente en
 * silencio — se pierde la voz clonada en ese turno puntual, pero la llamada
 * sigue.
 */
async function hablar(ws: WebSocket, session: ConversationSession, texto: string) {
  session.ultimoTextoAgente = texto;
  if (session.usaVozClonada()) {
    try {
      const audio = await sintetizarVozElevenLabs(session.empresaId, texto);
      enviar(ws, { type: "play", source: audioTemporalUrl(audio), interruptible: true });
      return;
    } catch (err) {
      console.error(`[${session.callSid}] Error sintetizando con ElevenLabs, uso voz por defecto:`, err);
    }
  }
  enviar(ws, { type: "text", token: texto, last: true });
}

// Transcripciones que no dicen nada ("mm", "eh", "ajá", un carraspeo que el
// STT convirtió en "ah"): no son un turno del cliente. Si se mandaran al
// modelo, cancelaban la respuesta en curso (esTurnoVigente) y el modelo
// contestaba a la nada o devolvía vacío — el bot "se callaba de repente".
const RELLENO = /^(?:\s*(?:m+h?m*|hm+|e+h+|a+h+|aj[aá]|u+h+|u+m+|o+h+|ey)\s*[.,¿?¡!…]*\s*)+$/i;

function esRuidoSinContenido(texto: string | undefined): boolean {
  const t = (texto ?? "").trim();
  return t.length < 2 || RELLENO.test(t);
}

// Si el cliente corta al bot con un ruido y luego no dice nada útil, el bot
// retoma solo pasado este tiempo (no antes: el STT tarda un poco en entregar
// lo que de verdad dijo).
const ESPERA_REANUDAR_MS = Number(process.env.ESPERA_REANUDAR_MS ?? 4000);
const MAX_REANUDACIONES_SEGUIDAS = 2;

/** Lo último que dijo el bot, recortado a sus 2 últimas frases si fue largo. */
function textoParaReanudar(texto: string): string {
  const t = texto.trim();
  if (t.length <= 220) return t;
  const frases = t.match(/[^.!?¿]+[.!?]+/g);
  return frases && frases.length > 2 ? frases.slice(-2).join(" ").trim() : t;
}

wss.on("connection", (ws) => {
  console.log("[ws] nueva conexión de ConversationRelay");
  ws.on("error", (err) => console.error("[ws] error en el socket:", err));
  ws.on("close", (code, reason) => console.log(`[ws] socket cerrado code=${code} reason=${reason}`));

  let session: ConversationSession | null = null;
  let finalizadaManualmente = false;
  let temporizadorLimite: NodeJS.Timeout | null = null;
  // Llamadas que salen por la central propia: Twilio ya las considera
  // "contestadas" cuando contesta el DISA de la central, antes de que el
  // cliente levante el teléfono. Hablar de una vez sería saludar al tono de
  // timbrado — se espera a oír la primera voz del cliente (ej. "¿aló?") y
  // recién ahí se dice el saludo.
  let esperandoPrimeraVoz = false;
  let saludoPendiente = "";
  // Pero esperar para siempre dejaba la llamada en blanco cuando el cliente
  // contestaba y se quedaba callado esperando que hablaran primero: si pasa
  // un rato sin oírlo, saluda igual, y si aun así no hay respuesta pregunta
  // una vez "¿aló?, ¿me escucha?".
  let clienteHablo = false;
  let temporizadorSilencio: NodeJS.Timeout | null = null;
  let temporizadorReanudar: NodeJS.Timeout | null = null;
  let reanudacionesSeguidas = 0;

  function cancelarReanudacion() {
    if (temporizadorReanudar) {
      clearTimeout(temporizadorReanudar);
      temporizadorReanudar = null;
    }
  }

  function programarReanudacion(s: ConversationSession) {
    cancelarReanudacion();
    if (reanudacionesSeguidas >= MAX_REANUDACIONES_SEGUIDAS || !s.ultimoTextoAgente) return;
    temporizadorReanudar = setTimeout(async () => {
      temporizadorReanudar = null;
      try {
        if (ws.readyState !== WebSocket.OPEN || finalizadaManualmente) return;
        reanudacionesSeguidas++;
        const texto = textoParaReanudar(s.ultimoTextoAgente);
        console.log(`[${s.callSid}] interrupción sin respuesta del cliente, el bot retoma: "${texto}"`);
        await hablar(ws, s, texto);
      } catch (err) {
        console.error("Error retomando tras una interrupción:", err);
      }
    }, ESPERA_REANUDAR_MS);
  }

  function programarSilencioInicial(s: ConversationSession) {
    temporizadorSilencio = setTimeout(async () => {
      try {
        if (!esperandoPrimeraVoz || ws.readyState !== WebSocket.OPEN) return;
        esperandoPrimeraVoz = false;
        s.registrarTurnoAgente(saludoPendiente);
        await hablar(ws, s, saludoPendiente);

        temporizadorSilencio = setTimeout(async () => {
          try {
            if (clienteHablo || ws.readyState !== WebSocket.OPEN) return;
            const reintento = "¿Aló? ¿Me escucha?";
            s.registrarTurnoAgente(reintento);
            await hablar(ws, s, reintento);
          } catch (err) {
            console.error("Error en el reintento por silencio:", err);
          }
        }, ESPERA_REINTENTO_MS);
      } catch (err) {
        console.error("Error saludando tras silencio inicial:", err);
      }
    }, ESPERA_VOZ_CLIENTE_MS);
  }

  ws.on("message", async (raw) => {
    let msg: ConversationRelayIncoming;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.error("Mensaje no-JSON recibido de ConversationRelay, ignorado");
      return;
    }

    // Temporal, para diagnosticar por qué a veces no llega nada cuando el
    // cliente habla: registra CADA mensaje que entra por el WebSocket, sea
    // cual sea su tipo (antes solo se logueaban errores, así que un "no pasó
    // nada" no dejaba ningún rastro para saber si el problema es que Twilio
    // nunca transcribe, o que llega algo y se descarta).
    console.log(
      `[ws] tipo=${msg.type}` +
        (msg.type === "prompt" ? ` last=${msg.last} voicePrompt="${msg.voicePrompt}"` : "")
    );

    try {
      switch (msg.type) {
        case "setup": {
          const empresaId = msg.customParameters?.empresaId;
          if (!empresaId) {
            console.error(`[${msg.callSid}] setup sin empresaId en customParameters`);
            enviar(ws, { type: "end" });
            ws.close();
            return;
          }

          const campanaContactoId = msg.customParameters?.campanaContactoId;
          const webhookLlamadaId = msg.customParameters?.webhookLlamadaId;
          const numeroCliente = msg.customParameters?.numeroCliente;
          session = new ConversationSession(msg.callSid, empresaId, campanaContactoId, webhookLlamadaId, numeroCliente);

          try {
            await session.inicializar();
          } catch (err) {
            // Si esto falla (no encuentra la config del webhook/campaña, la
            // IA no responde, etc.) antes NO se avisaba nada — la llamada se
            // quedaba conectada en silencio total hasta que alguien colgara
            // por cansancio. Ahora se le dice algo al cliente y se cuelga
            // en vez de dejarlo escuchando nada.
            console.error(`[${msg.callSid}] Error inicializando la sesión (setup):`, err);
            enviar(ws, {
              type: "text",
              token: "Disculpe, en este momento no podemos atender su llamada. Por favor intente más tarde.",
              last: true,
            });
            enviar(ws, { type: "end" });
            ws.close();
            return;
          }

          const saludo = session.saludoInicial();
          if (msg.customParameters?.esperarVozCliente === "1") {
            esperandoPrimeraVoz = true;
            saludoPendiente = saludo;
            programarSilencioInicial(session);
          } else {
            session.registrarTurnoAgente(saludo);
            await hablar(ws, session, saludo);
          }

          // Gestor de llamadas: si se llega al límite de duración, avisa y
          // corta — no queda esperando a que el LLM decida terminar solo.
          const limiteMs = session.duracionMaximaSegundos() * 1000;
          temporizadorLimite = setTimeout(async () => {
            // setTimeout no forma parte de ningún try/catch de arriba — sin
            // este propio try/catch, un fallo acá (ej. session.finalizar()
            // no puede guardar la transcripción por un problema de red) se
            // perdía como una promesa rechazada sin capturar, lo que antes
            // tumbaba el proceso ENTERO y cortaba TODAS las llamadas
            // activas, no solo esta.
            try {
              if (!session) return;
              console.log(`[${session.callSid}] duración máxima alcanzada, cerrando llamada`);
              const despedidaPorLimite =
                "Hemos llegado al tiempo máximo para esta llamada, así que la voy a finalizar aquí. Gracias por su tiempo.";
              session.registrarTurnoAgente(despedidaPorLimite);
              await hablar(ws, session, despedidaPorLimite);
              finalizadaManualmente = true;
              await session.finalizar();
              enviar(ws, { type: "end" });
              ws.close();
            } catch (err) {
              console.error(`[${session?.callSid}] Error cerrando la llamada por límite de duración:`, err);
            }
          }, limiteMs);
          break;
        }

        case "prompt": {
          if (!session) {
            console.error("prompt recibido sin sesión inicializada (falta setup)");
            return;
          }
          const sinContenido = esRuidoSinContenido(msg.voicePrompt);
          // Que el cliente esté hablando de verdad (aunque sea parcial)
          // cancela el "retomar lo que decía": se espera a oír su frase.
          if (!sinContenido) cancelarReanudacion();
          if (!msg.last) {
            // ConversationRelay puede mandar prompts parciales; solo actuamos
            // sobre el fragmento final del turno del usuario.
            return;
          }
          if (sinContenido && !esperandoPrimeraVoz) {
            console.log(`[${session.callSid}] ruido sin contenido ignorado: "${msg.voicePrompt}"`);
            return;
          }
          reanudacionesSeguidas = 0;

          // ConversationRelay corta la transcripción del cliente en cuanto
          // detecta una pausa, aunque en realidad siga hablando — eso manda
          // varios "prompt" con last=true seguidos para una sola frase real.
          // Sin este control, cada uno disparaba su propia respuesta (LLM +
          // síntesis de voz) y el cliente escuchaba el mismo mensaje
          // repetido, una tras otra. Se reserva el turno ANTES de procesar;
          // si al terminar ya hay uno más nuevo (llegó otro "prompt" mientras
          // este se generaba), se descarta esta respuesta en vez de decirla.
          const idTurno = session.nuevoTurno();

          clienteHablo = true;
          if (temporizadorSilencio) {
            clearTimeout(temporizadorSilencio);
            temporizadorSilencio = null;
          }

          if (esperandoPrimeraVoz) {
            // Primera voz del cliente tras contestar: se le responde con el
            // saludo de siempre en vez de mandar su "¿aló?" al modelo.
            esperandoPrimeraVoz = false;
            session.registrarTurnoCliente(msg.voicePrompt);
            session.registrarTurnoAgente(saludoPendiente);
            await hablar(ws, session, saludoPendiente);
            break;
          }

          // Red de seguridad extra: aunque correrTurno ya no debería tirar
          // por un fallo de herramienta (ver llm.ts), si por cualquier otra
          // razón esto falla (la API de OpenAI no responde, etc.), antes se
          // perdía la respuesta completa y el cliente se quedaba callado
          // sin ningún aviso. Ahora siempre se le dice algo.
          let resultado: Awaited<ReturnType<typeof session.procesarMensajeCliente>>;
          try {
            resultado = await session.procesarMensajeCliente(msg.voicePrompt);
          } catch (err) {
            console.error(`[${session.callSid}] Error procesando el mensaje del cliente:`, err);
            resultado = { textoRespuesta: "Disculpe, tuve un problema técnico. ¿Puede repetir eso, por favor?" };
          }

          if (!session.esTurnoVigente(idTurno)) {
            console.log(`[${session.callSid}] turno ${idTurno} descartado — ya llegó un prompt más nuevo`);
            return;
          }

          console.log(`[ws] respuesta generada: "${resultado.textoRespuesta}"`);

          const pausaMs = session.tiempoRespuestaSegundos() * 1000;
          if (pausaMs > 0) await new Promise((r) => setTimeout(r, pausaMs));

          if (!session.esTurnoVigente(idTurno)) {
            console.log(`[${session.callSid}] turno ${idTurno} descartado tras la pausa — ya llegó un prompt más nuevo`);
            return;
          }

          cancelarReanudacion();
          if (resultado.textoRespuesta) {
            await hablar(ws, session, resultado.textoRespuesta);
          } else if (!resultado.transferSolicitada) {
            // Nunca dejar al cliente en silencio: si el modelo no devolvió
            // texto, se le pide que repita en vez de callarse.
            console.error(`[${session.callSid}] correrTurno devolvió texto vacío — se pide repetir al cliente`);
            await hablar(ws, session, "Disculpe, no alcancé a escucharle bien. ¿Me puede repetir, por favor?");
          }

          if (resultado.transferSolicitada) {
            // El texto de despedida ya salió arriba; ahora sí terminamos la
            // sesión de ConversationRelay para que TwiML caiga al <Redirect>
            // que hace el <Dial> real hacia el humano.
            if (temporizadorLimite) clearTimeout(temporizadorLimite);
            finalizadaManualmente = true;
            await session.finalizar();
            enviar(ws, { type: "end" });
            ws.close();
          }
          break;
        }

        case "interrupt":
          // Twilio ya cortó el audio del bot. Si lo que sigue es una frase
          // real del cliente, llegará un "prompt" y se responde normal. Pero
          // si fue solo un ruido, no llegará nada y el bot quedaba mudo para
          // siempre: por eso se programa retomar lo que decía.
          console.log(
            `[ws] interrupción tras ${msg.durationUntilInterruptMs ?? "?"}ms: "${msg.utteranceUntilInterrupt ?? ""}"`
          );
          if (session && !finalizadaManualmente) programarReanudacion(session);
          break;

        case "dtmf":
          // Tonos de teclado. No usados todavía (guion es 100% por voz).
          break;

        case "error":
          // Antes esto no tenía case propio — el switch lo dejaba pasar en
          // silencio (solo se veía "[ws] tipo=error" sin ningún detalle).
          // Este es el mensaje que Twilio manda cuando algo falla del lado
          // de ConversationRelay (ej. no pudo descargar/reproducir un
          // "play"), y es justo lo que hace falta ver para diagnosticar.
          console.error(`[${session?.callSid ?? "?"}] Error reportado por ConversationRelay: ${msg.description}`);
          break;
      }
    } catch (err) {
      console.error("Error procesando mensaje de ConversationRelay:", err);
    }
  });

  ws.on("close", () => {
    if (temporizadorLimite) clearTimeout(temporizadorLimite);
    if (temporizadorSilencio) clearTimeout(temporizadorSilencio);
    cancelarReanudacion();
    if (finalizadaManualmente) return;
    session?.finalizar().catch((err) => console.error("Error finalizando sesión:", err));
  });
});

httpServer.listen(PORT, () => {
  console.log(`voz-ia-voice-server escuchando en :${PORT} (ws path: /voice-stream)`);
});
