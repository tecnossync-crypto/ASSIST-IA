"use server";

import { revalidatePath } from "next/cache";
import { actualizarEmpresa, obtenerEmpresa } from "@/lib/api";

export async function guardarEmpresaAction(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const numeros = String(formData.get("numeros_transferencia") ?? "").trim();

  const numeros_transferencia = numeros
    ? numeros.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Esta pantalla no toca guion/voz/campos/etiquetas — se conservan tal cual.
  const actual = await obtenerEmpresa();

  await actualizarEmpresa({
    nombre,
    numeros_transferencia,
    guion_agente: actual.guion_agente,
    voz_agente: actual.voz_agente,
    campos_personalizados: actual.campos_personalizados,
    etiquetas_disponibles: actual.etiquetas_disponibles,
    duracion_maxima_llamada_segundos: actual.duracion_maxima_llamada_segundos,
    timeout_timbrado_segundos: actual.timeout_timbrado_segundos,
    tiempo_respuesta_segundos: actual.tiempo_respuesta_segundos,
  });

  revalidatePath("/configuracion/empresa");
}
