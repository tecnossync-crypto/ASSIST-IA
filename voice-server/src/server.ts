import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";

// El .env vive en la raíz del monorepo, no en voice-server/.
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { ConversationSession } from "./session.js";
import type { ConversationRelayIncoming, ConversationRelayOutgoing } from "./types.js";

const PORT = Number(process.env.VOICE_SERVER_PORT ?? process.env.PORT ?? 3002);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "voz-ia-voice-server" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, path: "/voice-stream" });

function enviar(ws: WebSocket, mensaje: ConversationRelayOutgoing) {
  ws.send(JSON.stringify(mensaje));
}

wss.on("connection", (ws) => {
  let session: ConversationSession | null = null;
  let finalizadaManualmente = false;
  let temporizadorLimite: NodeJS.Timeout | null = null;

  ws.on("message", async (raw) => {
    let msg: ConversationRelayIncoming;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.error("Mensaje no-JSON recibido de ConversationRelay, ignorado");
      return;
    }

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
          session = new ConversationSession(msg.callSid, empresaId, campanaContactoId, webhookLlamadaId);
          await session.inicializar();

          const saludo = session.saludoInicial();
          session.registrarTurnoAgente(saludo);
          enviar(ws, { type: "text", token: saludo, last: true });

          // Gestor de llamadas: si se llega al límite de duración, avisa y
          // corta — no queda esperando a que el LLM decida terminar solo.
          const limiteMs = session.duracionMaximaSegundos() * 1000;
          temporizadorLimite = setTimeout(async () => {
            if (!session) return;
            console.log(`[${session.callSid}] duración máxima alcanzada, cerrando llamada`);
            session.registrarTurnoAgente(
              "Hemos llegado al tiempo máximo para esta llamada, así que la voy a finalizar aquí. Gracias por su tiempo."
            );
            enviar(ws, {
              type: "text",
              token: "Hemos llegado al tiempo máximo para esta llamada, así que la voy a finalizar aquí. Gracias por su tiempo.",
              last: true,
            });
            finalizadaManualmente = true;
            await session.finalizar();
            enviar(ws, { type: "end" });
            ws.close();
          }, limiteMs);
          break;
        }

        case "prompt": {
          if (!session) {
            console.error("prompt recibido sin sesión inicializada (falta setup)");
            return;
          }
          if (!msg.last) {
            // ConversationRelay puede mandar prompts parciales; solo actuamos
            // sobre el fragmento final del turno del usuario.
            return;
          }

          const resultado = await session.procesarMensajeCliente(msg.voicePrompt);

          const pausaMs = session.tiempoRespuestaSegundos() * 1000;
          if (pausaMs > 0) await new Promise((r) => setTimeout(r, pausaMs));

          if (resultado.textoRespuesta) {
            enviar(ws, { type: "text", token: resultado.textoRespuesta, last: true });
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
          // El cliente interrumpió al agente mientras hablaba. Fase 0: no
          // hacemos nada especial, Twilio ya cortó el audio de su lado.
          break;

        case "dtmf":
          // Tonos de teclado. No usados todavía (guion es 100% por voz).
          break;
      }
    } catch (err) {
      console.error("Error procesando mensaje de ConversationRelay:", err);
    }
  });

  ws.on("close", () => {
    if (temporizadorLimite) clearTimeout(temporizadorLimite);
    if (finalizadaManualmente) return;
    session?.finalizar().catch((err) => console.error("Error finalizando sesión:", err));
  });
});

httpServer.listen(PORT, () => {
  console.log(`voz-ia-voice-server escuchando en :${PORT} (ws path: /voice-stream)`);
});
