import { pool } from "../db/pool.js";
import { escaparXml } from "./twiml.js";

/**
 * Qué oye el cliente mientras espera: en pausa (el asesor lo puso en hold) o
 * esperando que lo atiendan tras una transferencia. Se configura por empresa
 * en Configuración → Enrutamiento.
 */
export type TipoEspera = "musica" | "audio" | "mensaje" | "mensaje_musica" | "silencio";
export const TIPOS_ESPERA: TipoEspera[] = ["musica", "audio", "mensaje", "mensaje_musica", "silencio"];

// Largo máximo del mensaje hablado (Twilio admite hasta 4096 caracteres por <Say>).
export const MAX_MENSAJE_ESPERA = 1500;

export const MUSICA_ESTANDAR = "https://demo.twilio.com/docs/classic.mp3";

export interface EsperaConfig {
  tipo: TipoEspera;
  audioUrl: string | null;
  mensaje: string | null;
  /** Frase que se dice una vez antes de esperar, al transferir (null = la de siempre). */
  aviso: string | null;
}

const ESPERA_POR_DEFECTO: EsperaConfig = { tipo: "musica", audioUrl: null, mensaje: null, aviso: null };

export async function esperaConfig(empresaId: string): Promise<EsperaConfig> {
  const r = await pool.query<{
    espera_tipo: TipoEspera;
    espera_audio_url: string | null;
    espera_mensaje: string | null;
    espera_aviso: string | null;
  }>("SELECT espera_tipo, espera_audio_url, espera_mensaje, espera_aviso FROM empresas WHERE id = $1", [empresaId]);
  const fila = r.rows[0];
  if (!fila) return ESPERA_POR_DEFECTO;
  return {
    tipo: TIPOS_ESPERA.includes(fila.espera_tipo) ? fila.espera_tipo : "musica",
    audioUrl: fila.espera_audio_url,
    mensaje: fila.espera_mensaje,
    aviso: fila.espera_aviso,
  };
}

/** Solo se acepta una URL https (Twilio la descarga; un http suelto no es seguro ni fiable). */
export function urlAudioValida(valor: unknown): valor is string {
  if (typeof valor !== "string" || valor.length > 500) return false;
  try {
    return new URL(valor).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * TwiML de la espera. `urlPropia` es esta misma ruta: los tipos "mensaje" y
 * "silencio" terminan con un Redirect a ella para repetirse hasta que la
 * llamada salga de la espera (Twilio corta el TwiML en cuanto el asesor
 * contesta o se quita la pausa).
 */
export function twimlEspera(config: EsperaConfig, urlPropia: string): string {
  const cabecera = '<?xml version="1.0" encoding="UTF-8"?>';
  const repetir = `<Redirect method="POST">${escaparXml(urlPropia)}</Redirect>`;

  if (config.tipo === "silencio") {
    return `${cabecera}<Response><Pause length="60"/>${repetir}</Response>`;
  }
  if (config.tipo === "mensaje" && config.mensaje?.trim()) {
    return `${cabecera}<Response><Say language="es-MX">${escaparXml(config.mensaje.trim())}</Say><Pause length="5"/>${repetir}</Response>`;
  }
  if (config.tipo === "mensaje_musica" && config.mensaje?.trim()) {
    // Twilio no mezcla voz y música a la vez: se alternan. La música es el
    // audio propio si hay uno, o la estándar; suena una vez y se vuelve a leer el mensaje.
    const musica = urlAudioValida(config.audioUrl) ? config.audioUrl : MUSICA_ESTANDAR;
    return `${cabecera}<Response><Say language="es-MX">${escaparXml(config.mensaje.trim())}</Say><Play loop="1">${escaparXml(musica)}</Play>${repetir}</Response>`;
  }
  if (config.tipo === "audio" && urlAudioValida(config.audioUrl)) {
    return `${cabecera}<Response><Play loop="0">${escaparXml(config.audioUrl)}</Play></Response>`;
  }
  return `${cabecera}<Response><Play loop="0">${MUSICA_ESTANDAR}</Play></Response>`;
}
