"use server";

import { revalidatePath } from "next/cache";
import { actualizarEtiquetasContacto, actualizarDatosContacto } from "@/lib/api";

export async function guardarEtiquetasAction(formData: FormData) {
  const contactoId = String(formData.get("contactoId"));
  const etiquetasJson = String(formData.get("etiquetas_json") ?? "[]");

  let etiquetas: string[] = [];
  try {
    etiquetas = JSON.parse(etiquetasJson);
  } catch {
    etiquetas = [];
  }

  await actualizarEtiquetasContacto(contactoId, etiquetas);
  revalidatePath(`/contactos/${contactoId}`);
  revalidatePath("/contactos");
}

export async function guardarDatosContactoAction(formData: FormData) {
  const contactoId = String(formData.get("contactoId"));
  const datosJson = String(formData.get("datos_json") ?? "{}");

  let datos: Record<string, string> = {};
  try {
    datos = JSON.parse(datosJson);
  } catch {
    datos = {};
  }

  await actualizarDatosContacto(contactoId, datos);
  revalidatePath(`/contactos/${contactoId}`);
  revalidatePath("/contactos");
}
