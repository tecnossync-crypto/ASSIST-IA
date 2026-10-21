/**
 * Detecta cuando, en una llamada SALIENTE, quien "contestó" no es el cliente sino la grabación del operador
 * telefónico ("el número marcado no existe", "fuera del área de servicio", "apagado o fuera de cobertura"...).
 * Para Twilio esa llamada fue contestada, así que el agente de IA empezaba a hablarle a una grabación; con esto
 * se cuelga de inmediato.
 *
 * Es deliberadamente conservador: exige frases típicas de esas grabaciones, para no colgarle a un cliente real
 * que diga algo parecido ("ese número no existe en mi casa", etc. no cumple los patrones de abajo).
 */

const PATRONES: RegExp[] = [
  /\bnumero (que )?(usted )?(ha )?(marcado|marco|llamado|llamo)\b.*\b(no existe|no esta (disponible|asignado|en servicio)|fuera de servicio|incorrecto|equivocado|invalido)/,
  /\b(el )?numero (marcado|al que (usted )?(llama|llamo|marco))\b.*\b(no existe|no esta (disponible|asignado|en servicio)|fuera de servicio|incorrecto|equivocado)/,
  /\bel numero (marcado )?no existe\b/,
  /\bel numero (que )?(usted )?(marco|marca|llamo|llama) no existe\b/,
  /\bno existe (el|este) numero\b/,
  /\b(el numero|numero marcado) no (existe|esta asignado|esta en servicio|se encuentra en servicio)\b/,
  /\bnumero (fuera de servicio|inexistente|inhabilitado|suspendido|desconectado|cancelado)\b/,
  /\bel numero (marcado )?(esta|se encuentra) (fuera de servicio|inhabilitado|suspendido|desconectado)\b/,
  /\bverifique (el|este) numero\b/,
  /\bverifique (e )?intente de nuevo\b/,
  /\bno (es posible|podemos) (completar|realizar) su llamada\b/,
  /\bsu llamada no (puede|pudo) ser (completada|realizada)\b/,
  /\bel usuario (al que (usted )?(llama|llamo)|marcado)\b.*\b(apagado|fuera de (cobertura|servicio|area)|no esta disponible|no puede atender)/,
  /\b(telefono|celular|equipo|abonado|linea) (se encuentra )?(apagado|fuera de (cobertura|servicio|area))\b/,
  /\bse encuentra (apagado|fuera del area de (cobertura|servicio))\b/,
  /\bfuera del area de (cobertura|servicio)\b/,
  /\bel (abonado|cliente) (al que (usted )?llama )?(no esta disponible|esta ocupado|no puede atender)\b/,
  /\blinea (fuera de servicio|inhabilitada|desconectada|suspendida|no existe)\b/,
  /\bnumber you (have )?(dialed|called) (is not|does not|is no longer)\b/,
  /\bthe number you (have )?(dialed|called)\b/,
];

// Grabaciones de BUZÓN DE VOZ / contestador: quien "contestó" es una máquina que pide dejar un mensaje. Hablarle (o
// peor, transferirla a un asesor como si fuera el cliente) no tiene sentido: se cuelga.
const PATRONES_BUZON: RegExp[] = [
  /\b(deje|dejar|graba|grabe|puede dejar|puede grabar)\b.*\b(mensaje|recado)\b/,
  /\b(despues|luego|al escuchar|al oir)\b.*\b(del )?(tono|pitido|beep|senal|sonido)\b/,
  /\b(buzon|casilla|correo|contestador)( de voz| automatico)?\b.*\b(mensaje|tono|disponible|ocupado|lleno)\b/,
  /\b(buzon de voz|casilla de voz|correo de voz|contestador automatico)\b/,
  /\bno (esta|se encuentra|puedo|podemos) (disponible|atender)\b.*\b(mensaje|tono|buzon)\b/,
  /\b(esta|se encuentra) (ocupado|fuera)\b.*\b(deje|mensaje|tono)\b/,
  /\bat the tone\b|\bafter the (tone|beep)\b|\bleave (a|your) message\b|\bvoice ?mail\b/,
];

export type TipoGrabacion = "numero_inexistente" | "buzon";

/** ¿Lo que "contestó" es una grabación del operador o un buzón de voz? */
export function clasificarGrabacion(texto: string | undefined): TipoGrabacion | null {
  if (!texto) return null;
  const t = normalizar(texto);
  if (t.length < 16) return null;
  if (PATRONES.some((p) => p.test(t))) return "numero_inexistente";
  if (PATRONES_BUZON.some((p) => p.test(t))) return "buzon";
  return null;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function esMensajeDeNumeroInexistente(texto: string | undefined): boolean {
  if (!texto) return false;
  const t = normalizar(texto);
  if (t.length < 16) return false;
  return PATRONES.some((p) => p.test(t));
}
