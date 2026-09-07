"use server";

import { revalidatePath } from "next/cache";
import {
  actualizarEtiquetasContacto,
  actualizarDatosContacto,
  actualizarPropietarioContacto,
  eliminarContacto,
} from "@/lib/api";
import { auditar } from "@/lib/session";

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

export async function guardarPropietarioAction(formData: FormData) {
  const contactoId = String(formData.get("contactoId"));
  const propietarioUsuarioId = String(formData.get("propietarioUsuarioId") ?? "").trim() || null;

  await actualizarPropietarioContacto(contactoId, propietarioUsuarioId);
  revalidatePath(`/contactos/${contactoId}`);
  revalidatePath("/contactos");
  await auditar("actualizar", "contacto_propietario", { contactoId, propietarioUsuarioId });
}

// Sin redirect() acá a propósito: BotonEliminarContacto (cliente) atrapa
// cualquier error de esta acción para mostrar el mensaje inline — un
// redirect() lanzado desde dentro de ese try/catch se leería como un error
// aunque el borrado sí funcionara. La navegación de vuelta a /contactos la
// hace el propio componente cliente con router.push después de que esto
// resuelva bien.
export async function eliminarContactoAction(contactoId: string) {
  await eliminarContacto(contactoId);
  revalidatePath("/contactos");
  await auditar("eliminar", "contacto", { contactoId });
}
