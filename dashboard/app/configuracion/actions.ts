"use server";

import { revalidatePath } from "next/cache";
import { actualizarEmpresa, obtenerEmpresa, type GuionAgente } from "@/lib/api";

export async function guardarConfiguracion(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const promptPersonalizado = String(formData.get("prompt_personalizado") ?? "").trim();
  const saludo = String(formData.get("saludo") ?? "").trim();
  const queResuelve = String(formData.get("que_resuelve") ?? "").trim();
  const cuandoTransferir = String(formData.get("cuando_transferir") ?? "").trim();
  const numeros = String(formData.get("numeros_transferencia") ?? "").trim();
  const vozAgente = String(formData.get("voz_agente") ?? "").trim();
  const duracionMaximaMinutos = parseFloat(String(formData.get("duracion_maxima_minutos") ?? "10")) || 10;
  const timeoutTimbrado = parseInt(String(formData.get("timeout_timbrado_segundos") ?? "30"), 10) || 30;

  const guion_agente: GuionAgente = {
    prompt_personalizado: promptPersonalizado || undefined,
    saludo: saludo || undefined,
    que_resuelve: queResuelve || undefined,
    // Estos tres siempre se piden, además de lo que la empresa agregue en Campos y etiquetas.
    datos_a_tomar: ["nombre", "apellido", "telefono"],
    cuando_transferir: cuandoTransferir || undefined,
  };

  const numeros_transferencia = numeros
    ? numeros.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Esta pantalla no toca campos_personalizados/etiquetas_disponibles — se
  // conservan tal cual estaban (viven en su propia sección).
  const actual = await obtenerEmpresa();

  await actualizarEmpresa({
    nombre,
    guion_agente,
    numeros_transferencia,
    voz_agente: vozAgente || null,
    campos_personalizados: actual.campos_personalizados,
    etiquetas_disponibles: actual.etiquetas_disponibles,
    duracion_maxima_llamada_segundos: Math.round(duracionMaximaMinutos * 60),
    timeout_timbrado_segundos: timeoutTimbrado,
  });
  revalidatePath("/configuracion");
}
