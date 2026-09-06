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
  const etiquetaDisparador = String(formData.get("etiqueta_disparador") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const modoLlamada = String(formData.get("modo_llamada") ?? "inmediato").trim();
  const fechaLlamada = String(formData.get("fecha_llamada") ?? "").trim();

  if (!nombre || !disparador || !accion) return;

  const disparadorDatos: Record<string, string> =
    disparador === "etiqueta_agregada" ? { etiqueta: etiquetaDisparador } : {};

  if (disparador === "etiqueta_agregada" && !etiquetaDisparador) return;

  let accionDatos: Record<string, string>;
  if (accion === "agregar_etiqueta") {
    accionDatos = { etiqueta };
  } else if (accion === "llamar_contacto") {
    if (modoLlamada === "programada" && !fechaLlamada) return; // sin fecha no tiene sentido crearla
    accionDatos = modoLlamada === "programada" ? { modo: "programada", fecha: fechaLlamada } : { modo: "inmediato" };
  } else {
    accionDatos = { tipo: tipo || "seguimiento", descripcion };
  }

  await crearFlujoTrabajo({ nombre, disparador, disparadorDatos, accion, accionDatos });
  revalidatePath("/configuracion/flujos");
  await auditar("crear", "flujo_trabajo", { nombre, disparador, accion });
}

export async function activarFlujoAction(id: string) {
  await activarFlujoTrabajo(id);
  revalidatePath("/configuracion/flujos");
  await auditar("activar", "flujo_trabajo", { id });
}

export async function desactivarFlujoAction(id: string) {
  await desactivarFlujoTrabajo(id);
  revalidatePath("/configuracion/flujos");
  await auditar("desactivar", "flujo_trabajo", { id });
}

export async function eliminarFlujoAction(id: string) {
  await eliminarFlujoTrabajo(id);
  revalidatePath("/configuracion/flujos");
  await auditar("eliminar", "flujo_trabajo", { id });
}
