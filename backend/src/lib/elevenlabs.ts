import { pool } from "../db/pool.js";
import { desencriptar } from "./crypto.js";

/**
 * Clonación de voz (Instant Voice Cloning) vía la API de ElevenLabs. La
 * empresa sube 1-5 minutos de audio, se crea la voz clonada, y el voice_id
 * resultante se guarda como voz_agente (tts_provider="elevenlabs").
 *
 * OJO: el ttsProvider="ElevenLabs" nativo de Twilio ConversationRelay NO
 * acepta voces clonadas privadas — solo reconoce el catálogo propio de
 * ElevenLabs que Twilio tiene integrado (ver voice-server/src/session.ts,
 * usaVozClonada()). Por eso una voz clonada aquí SIEMPRE se sintetiza
 * nosotros mismos con sintetizarVoz() de abajo y se manda a Twilio como
 * audio ya generado (mensaje "play"), nunca como texto con
 * ttsProvider="ElevenLabs".
 */
export async function clonarVoz(
  empresaId: string,
  nombreVoz: string,
  audio: Buffer,
  nombreArchivo: string
): Promise<{ voiceId: string }> {
  const empresa = await pool.query<{ elevenlabs_api_key_enc: string | null }>(
    "SELECT elevenlabs_api_key_enc FROM empresas WHERE id = $1",
    [empresaId]
  );
  const keyEnc = empresa.rows[0]?.elevenlabs_api_key_enc;
  if (!keyEnc) {
    throw new Error("La empresa no tiene una API key de ElevenLabs configurada");
  }
  const apiKey = desencriptar(keyEnc);

  const form = new FormData();
  form.append("name", nombreVoz);
  form.append("files", new Blob([new Uint8Array(audio)]), nombreArchivo);

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`ElevenLabs respondió ${res.status}: ${detalle}`);
  }

  const data = (await res.json()) as { voice_id: string };
  return { voiceId: data.voice_id };
}

/**
 * Convierte texto a audio (MP3) con la voz clonada de la empresa, llamando
 * directamente a la API de Text-to-Speech de ElevenLabs con SU voice_id y SU
 * API key — a diferencia de clonarVoz(), esto se llama en cada turno de
 * conversación (ver /internal/empresas/:id/tts en routes/internal.ts).
 */
export async function sintetizarVoz(empresaId: string, texto: string): Promise<Buffer> {
  const empresa = await pool.query<{
    elevenlabs_api_key_enc: string | null;
    voz_agente: string | null;
    tts_provider: string | null;
  }>("SELECT elevenlabs_api_key_enc, voz_agente, tts_provider FROM empresas WHERE id = $1", [empresaId]);

  const fila = empresa.rows[0];
  if (!fila || fila.tts_provider !== "elevenlabs" || !fila.voz_agente) {
    throw new Error("La empresa no tiene una voz clonada de ElevenLabs activa");
  }
  if (!fila.elevenlabs_api_key_enc) {
    throw new Error("La empresa no tiene una API key de ElevenLabs configurada");
  }
  const apiKey = desencriptar(fila.elevenlabs_api_key_enc);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${fila.voz_agente}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: texto,
      model_id: "eleven_turbo_v2_5", // baja latencia — importa en una llamada en vivo
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`ElevenLabs (TTS) respondió ${res.status}: ${detalle}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
