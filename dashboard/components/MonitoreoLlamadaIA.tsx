"use client";

import { useRef, useState } from "react";
import { Headphones, X, Loader2 } from "lucide-react";

// Decodificador estándar G.711 μ-law → PCM16 (una tabla de 256 entradas
// calculada una sola vez) — es el formato en el que Twilio manda el audio
// crudo por Media Streams (8kHz, mono, 1 byte/muestra).
const TABLA_MULAW = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const byte = ~i & 0xff;
  const signo = byte & 0x80;
  const exponente = (byte >> 4) & 0x07;
  const mantisa = byte & 0x0f;
  let muestra = ((mantisa << 3) + 0x84) << exponente;
  muestra -= 0x84;
  TABLA_MULAW[i] = signo ? -muestra : muestra;
}

function base64ABytes(b64: string): Uint8Array {
  const binario = atob(b64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Escuchar en vivo una llamada de IA todavía en curso con el bot (no una
 * "llamada normal" — esa usa MonitoreoLlamada, por conferencia de Twilio).
 * Se conecta directo desde el navegador al voice-server (mismo WebSocket
 * público al que Twilio le manda el audio, ver supervision-stream.ts) y
 * reproduce cada paquete apenas llega — cliente y bot llegan en pistas
 * separadas (track) pero suenan mezclados porque ambas rutas de audio
 * comparten el mismo AudioContext.
 */
export function MonitoreoLlamadaIA({ callSid }: { callSid: string }) {
  const [estado, setEstado] = useState<"idle" | "conectando" | "escuchando" | "error">("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  // Cursor de reproducción POR PISTA (cliente/bot) — así cada una se
  // reproduce en su propio orden sin pisarse ni acelerarse entre sí.
  const proximoInicioPorPista = useRef<Map<string, number>>(new Map());

  function reproducirPaquete(track: string, payloadBase64: string) {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const bytes = base64ABytes(payloadBase64);
    const muestras = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) muestras[i] = TABLA_MULAW[bytes[i]] / 32768;

    const buffer = ctx.createBuffer(1, muestras.length, 8000);
    buffer.copyToChannel(muestras, 0);

    const fuente = ctx.createBufferSource();
    fuente.buffer = buffer;
    fuente.connect(ctx.destination);

    const ahora = ctx.currentTime;
    const proximo = proximoInicioPorPista.current.get(track) ?? ahora;
    // Si el navegador se atrasó (buffer vacío hace rato), no intentes
    // "ponerte al día" reproduciendo todo pegado — retoma desde ahora.
    const inicio = Math.max(proximo, ahora);
    fuente.start(inicio);
    proximoInicioPorPista.current.set(track, inicio + buffer.duration);
  }

  function escuchar() {
    const voiceWsUrl = process.env.NEXT_PUBLIC_VOICE_WS_URL;
    if (!voiceWsUrl) {
      setEstado("error");
      return;
    }

    setEstado("conectando");
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    ctxRef.current = ctx;
    proximoInicioPorPista.current.clear();

    const url = voiceWsUrl.replace(/\/voice-stream\/?$/, "/supervision-stream");
    const ws = new WebSocket(`${url}?rol=oyente&callSid=${encodeURIComponent(callSid)}`);
    wsRef.current = ws;

    ws.onopen = () => setEstado("escuchando");
    ws.onerror = () => setEstado("error");
    ws.onclose = () => setEstado((s) => (s === "escuchando" ? "idle" : s));
    ws.onmessage = (ev) => {
      try {
        const { track, payload } = JSON.parse(ev.data);
        if (track && payload) reproducirPaquete(track, payload);
      } catch {
        // paquete raro, se ignora — no vale la pena tumbar la sesión por uno
      }
    };
  }

  function dejarDeEscuchar() {
    wsRef.current?.close();
    wsRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    setEstado("idle");
  }

  if (estado === "escuchando" || estado === "conectando") {
    return (
      <button
        type="button"
        onClick={dejarDeEscuchar}
        className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
      >
        {estado === "conectando" ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
        {estado === "conectando" ? "Conectando…" : "Dejar de escuchar"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={escuchar}
      className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
    >
      <Headphones size={12} />
      {estado === "error" ? "Reintentar" : "Escuchar (IA)"}
    </button>
  );
}
