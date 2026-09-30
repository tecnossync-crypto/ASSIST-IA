import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

/**
 * Relay de audio EN VIVO para Supervisión: Twilio manda el audio crudo de
 * cada llamada de IA (cliente + voz del bot, ver <Start><Stream> en
 * twiml.ts) a este mismo WebSocket, y cualquier admin conectado como
 * "oyente" de ese callSid recibe cada paquete tal cual, casi sin retraso.
 * No se guarda nada acá — si no hay nadie escuchando, el audio simplemente
 * se descarta (no hay buffer/historial, es solo un pase en vivo).
 *
 * Comparte el mismo httpServer que ConversationRelay (/voice-stream) en un
 * path distinto (/supervision-stream), así que no hace falta otro puerto.
 */
export function registrarSupervisionStream(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: "/supervision-stream" });
  const oyentesPorCallSid = new Map<string, Set<WebSocket>>();

  function agregarOyente(callSid: string, ws: WebSocket) {
    let set = oyentesPorCallSid.get(callSid);
    if (!set) {
      set = new Set();
      oyentesPorCallSid.set(callSid, set);
    }
    set.add(ws);
  }

  function quitarOyente(callSid: string, ws: WebSocket) {
    const set = oyentesPorCallSid.get(callSid);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) oyentesPorCallSid.delete(callSid);
  }

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const callSidQuery = url.searchParams.get("callSid");
    const esOyente = url.searchParams.get("rol") === "oyente";

    if (esOyente) {
      if (!callSidQuery) {
        ws.close(1008, "callSid requerido");
        return;
      }
      agregarOyente(callSidQuery, ws);
      ws.on("close", () => quitarOyente(callSidQuery, ws));
      ws.on("error", () => quitarOyente(callSidQuery, ws));
      return;
    }

    // Conexión de Twilio (<Start><Stream>) — un socket por llamada, manda
    // eventos start/media/stop en JSON. El callSid real viaja en el propio
    // evento "start" (más confiable que el query string, pero el query
    // sirve de respaldo si por lo que sea no llega ese evento a tiempo).
    let callSid = callSidQuery;

    ws.on("message", (raw) => {
      let msg: { event?: string; start?: { callSid?: string }; media?: { track?: string; payload?: string } };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.event === "start") {
        callSid = msg.start?.callSid ?? callSid;
        return;
      }

      if (msg.event === "media" && callSid && msg.media?.payload) {
        const oyentes = oyentesPorCallSid.get(callSid);
        if (!oyentes || oyentes.size === 0) return;
        const paquete = JSON.stringify({ track: msg.media.track ?? "unknown", payload: msg.media.payload });
        for (const oyente of oyentes) {
          if (oyente.readyState === WebSocket.OPEN) oyente.send(paquete);
        }
        return;
      }

      if (msg.event === "stop" && callSid) {
        const oyentes = oyentesPorCallSid.get(callSid);
        oyentes?.forEach((o) => o.close(1000, "llamada terminada"));
        oyentesPorCallSid.delete(callSid);
      }
    });

    ws.on("close", () => {
      if (!callSid) return;
      const oyentes = oyentesPorCallSid.get(callSid);
      oyentes?.forEach((o) => o.close(1000, "llamada terminada"));
      oyentesPorCallSid.delete(callSid);
    });
  });

  return wss;
}
