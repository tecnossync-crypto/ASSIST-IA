"use server";

import { revalidatePath } from "next/cache";
import { actualizarEmpresa, obtenerEmpresa, actualizarCentralPropia } from "@/lib/api";
import { auditar } from "@/lib/session";

export async function guardarEmpresaAction(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();

  // Esta pantalla no toca guion/voz/campos/etiquetas — se conservan tal cual.
  const actual = await obtenerEmpresa();

  await actualizarEmpresa({
    nombre,
    guion_agente: actual.guion_agente,
    voz_agente: actual.voz_agente,
    tts_provider: actual.tts_provider,
    campos_personalizados: actual.campos_personalizados,
    etiquetas_disponibles: actual.etiquetas_disponibles,
    duracion_maxima_llamada_segundos: actual.duracion_maxima_llamada_segundos,
    timeout_timbrado_segundos: actual.timeout_timbrado_segundos,
    tiempo_respuesta_segundos: actual.tiempo_respuesta_segundos,
  });

  revalidatePath("/configuracion/empresa");
  await auditar("actualizar", "empresa", { nombre });
}

export interface EstadoCentralPropia {
  error?: string;
  ok?: boolean;
}

export async function guardarCentralPropiaAction(
  _prevState: EstadoCentralPropia | null,
  formData: FormData
): Promise<EstadoCentralPropia> {
  const activa = formData.get("activa") === "on";
  const dominio = String(formData.get("dominio") ?? "").trim();
  const authTipo = String(formData.get("authTipo") ?? "ip") as "ip" | "credenciales";
  const usuario = String(formData.get("usuario") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const saliente = formData.get("saliente") === "on";
  const entrante = formData.get("entrante") === "on";

  if (activa && !dominio) {
    return { error: "El dominio/IP de la central es requerido para activarla." };
  }

  try {
    await actualizarCentralPropia({
      activa,
      dominio: dominio || undefined,
      authTipo,
      usuario: usuario || undefined,
      password: password || undefined,
      saliente,
      entrante,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando la configuración." };
  }

  revalidatePath("/configuracion/empresa");
  await auditar("actualizar", "central_propia", { activa, dominio, saliente, entrante });
  return { ok: true };
}
