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
}

export async function activarFlujoAction(formData: FormData) {
  await activarFlujoTrabajo(String(formData.get("id")));
  revalidatePath("/configuracion/flujos");
}

export async function desactivarFlujoAction(formData: FormData) {
  await desactivarFlujoTrabajo(String(formData.get("id")));
  revalidatePath("/configuracion/flujos");
}

export async function eliminarFlujoAction(formData: FormData) {
  await eliminarFlujoTrabajo(String(formData.get("id")));
  revalidatePath("/configuracion/flujos");
}
