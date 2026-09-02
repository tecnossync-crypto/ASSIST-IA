"use server";

import { revalidatePath } from "next/cache";
import { actualizarEtiquetasContacto } from "@/lib/api";

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
