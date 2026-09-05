"use server";

import { revalidatePath } from "next/cache";
import {
  crearFlujoTrabajo,
  activarFlujoTrabajo,
  desactivarFlujoTrabajo,
  eliminarFlujoTrabajo,
  type DisparadorFlujo,
  type AccionFlujo,
} from "@/lib/api";
import { auditar } from "@/lib/session";

export async function crearFlujoAction(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const disparador = String(formData.get("disparador") ?? "") as DisparadorFlujo;
  const accion = String(formData.get("accion") ?? "") as AccionFlujo;
  const etiqueta = String(formData.get("etiqueta") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();

  if (!nombre || !disparador || !accion) return;

  const accionDatos: Record<string, string> =
    accion === "agregar_etiqueta" ? { etiqueta } : { tipo: tipo || "seguimiento", descripcion };

  await crearFlujoTrabajo({ nombre, disparador, accion, accionDatos });
  revalidatePath("/configuracion/flujos");
  await auditar("crear", "flujo_trabajo", { nombre, disparador, accion });
}

export async function activarFlujoAction(formData: FormData) {
  const id = String(formData.get("id"));
  await activarFlujoTrabajo(id);
  revalidatePath("/configuracion/flujos");
  await auditar("activar", "flujo_trabajo", { id });
}

export async function desactivarFlujoAction(formData: FormData) {
  const id = String(formData.get("id"));
  await desactivarFlujoTrabajo(id);
  revalidatePath("/configuracion/flujos");
  await auditar("desactivar", "flujo_trabajo", { id });
}

export async function eliminarFlujoAction(formData: FormData) {
  const id = String(formData.get("id"));
  await eliminarFlujoTrabajo(id);
  revalidatePath("/configuracion/flujos");
  await auditar("eliminar", "flujo_trabajo", { id });
}
