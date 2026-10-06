"use server";

import { revalidatePath } from "next/cache";
import {
  actualizarEmpresa,
  obtenerEmpresa,
  obtenerImpactoEtiqueta,
  obtenerImpactoCampo,
  eliminarEtiquetaCatalogo,
  eliminarCampoCatalogo,
  type CampoPersonalizado,
  type EtiquetaDisponible,
} from "@/lib/api";
import { auditar } from "@/lib/session";

export async function guardarContactosConfigAction(formData: FormData) {
  const camposJson = String(formData.get("campos_personalizados_json") ?? "[]");
  const etiquetasJson = String(formData.get("etiquetas_disponibles_json") ?? "[]");

  let campos_personalizados: CampoPersonalizado[] = [];
  try {
    campos_personalizados = (JSON.parse(camposJson) as CampoPersonalizado[]).filter((c) => c.nombre?.trim());
  } catch {
    campos_personalizados = [];
  }

  let etiquetas_disponibles: EtiquetaDisponible[] = [];
  try {
    etiquetas_disponibles = (JSON.parse(etiquetasJson) as EtiquetaDisponible[]).filter((e) => e.nombre?.trim());
  } catch {
    etiquetas_disponibles = [];
  }

  // Esta pantalla no toca nombre/guion/voz — se conservan tal cual.
  const actual = await obtenerEmpresa();

  await actualizarEmpresa({
    nombre: actual.nombre,
    guion_agente: actual.guion_agente,
    voz_agente: actual.voz_agente,
    tts_provider: actual.tts_provider,
    duracion_maxima_llamada_segundos: actual.duracion_maxima_llamada_segundos,
    timeout_timbrado_segundos: actual.timeout_timbrado_segundos,
    tiempo_respuesta_segundos: actual.tiempo_respuesta_segundos,
    campos_personalizados,
    etiquetas_disponibles,
  });

  revalidatePath("/configuracion/contactos");
  await auditar("actualizar", "contactos_config", {
    campos: campos_personalizados.map((c) => c.nombre),
    etiquetas: etiquetas_disponibles.map((e) => e.nombre),
  });
}

export type TipoCatalogo = "etiqueta" | "campo";

export interface ResultadoImpacto {
  contactos?: number;
  flujos?: { id: string; nombre: string }[];
  error?: string;
}

// Devuelven el error en vez de lanzarlo: en producción una Server Action que
// lanza solo muestra un mensaje genérico y el modal no sabría qué decir.
export async function obtenerImpactoCatalogoAction(tipo: TipoCatalogo, nombre: string): Promise<ResultadoImpacto> {
  try {
    return tipo === "etiqueta" ? await obtenerImpactoEtiqueta(nombre) : await obtenerImpactoCampo(nombre);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo calcular el impacto." };
  }
}

export async function eliminarCatalogoAction(tipo: TipoCatalogo, nombre: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    if (tipo === "etiqueta") await eliminarEtiquetaCatalogo(nombre);
    else await eliminarCampoCatalogo(nombre);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo eliminar." };
  }
  revalidatePath("/configuracion/contactos");
  revalidatePath("/contactos");
  await auditar("eliminar", tipo === "etiqueta" ? "etiqueta_contactos" : "campo_contactos", { nombre });
  return { ok: true };
}
