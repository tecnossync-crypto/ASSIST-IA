"use server";

import { revalidatePath } from "next/cache";
import { actualizarEmpresa, obtenerEmpresa, type GuionAgente } from "@/lib/api";
import { auditar } from "@/lib/session";

export async function guardarIaAction(formData: FormData) {
  const promptPersonalizado = String(formData.get("prompt_personalizado") ?? "").trim();
  const saludo = String(formData.get("saludo") ?? "").trim();
  const queResuelve = String(formData.get("que_resuelve") ?? "").trim();
  const cuandoTransferir = String(formData.get("cuando_transferir") ?? "").trim();
  const vozAgente = String(formData.get("voz_agente") ?? "").trim();
  const ttsProvider = String(formData.get("tts_provider") ?? "").trim();
  const tiempoRespuesta = parseFloat(String(formData.get("tiempo_respuesta_segundos") ?? "0")) || 0;
  const duracionMaximaMinutos = parseFloat(String(formData.get("duracion_maxima_minutos") ?? "10")) || 10;
  const timeoutTimbrado = parseInt(String(formData.get("timeout_timbrado_segundos") ?? "30"), 10) || 30;

  const guion_agente: GuionAgente = {
    prompt_personalizado: promptPersonalizado || undefined,
    saludo: saludo || undefined,
    que_resuelve: queResuelve || undefined,
    // Estos tres siempre se piden, además de lo que la empresa agregue en Contactos.
    datos_a_tomar: ["nombre", "apellido", "telefono"],
    cuando_transferir: cuandoTransferir || undefined,
  };

  // Esta pantalla no toca nombre/campos/etiquetas — se conservan tal cual.
  const actual = await obtenerEmpresa();

  await actualizarEmpresa({
    nombre: actual.nombre,
    campos_personalizados: actual.campos_personalizados,
    etiquetas_disponibles: actual.etiquetas_disponibles,
    guion_agente,
    voz_agente: vozAgente || null,
    tts_provider: vozAgente ? ttsProvider || null : null,
    tiempo_respuesta_segundos: tiempoRespuesta,
    duracion_maxima_llamada_segundos: Math.round(duracionMaximaMinutos * 60),
    timeout_timbrado_segundos: timeoutTimbrado,
  });

  revalidatePath("/configuracion/ia");
  await auditar("actualizar", "ia", {
    voz_agente: vozAgente || null,
    tts_provider: ttsProvider || null,
    tiempo_respuesta_segundos: tiempoRespuesta,
    duracion_maxima_minutos: duracionMaximaMinutos,
    modo: promptPersonalizado ? "prompt_libre" : "guiado",
  });
}
