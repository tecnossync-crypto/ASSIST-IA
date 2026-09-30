import { pool } from "../db/pool.js";
import { desencriptar } from "./crypto.js";

/**
 * Clonación de voz (Instant Voice Cloning) vía la API de ElevenLabs. La
 * empresa sube 1-5 minutos de audio, se crea la voz clonada, y el voice_id
 * resultante se guarda como voz_agente (tts_provider="elevenlabs") para que
 * ConversationRelay la use en las llamadas.
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
