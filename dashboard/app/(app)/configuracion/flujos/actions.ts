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
  const cantidadEspera = Math.floor(Number(formData.get("retraso_cantidad") ?? 0));
  const unidadEspera = String(formData.get("retraso_unidad") ?? "minutos");
  const minutosPorUnidad = unidadEspera === "dias" ? 1440 : unidadEspera === "horas" ? 60 : 1;
  // Tope de 30 días (el backend aplica el mismo límite).
  const retrasoMinutos = Number.isFinite(cantidadEspera) && cantidadEspera > 0
    ? Math.min(cantidadEspera * minutosPorUnidad, 60 * 24 * 30)
    : 0;

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

  // Con fecha y hora específica no aplica una espera aparte.
  if (retrasoMinutos > 0 && accionDatos.modo !== "programada") {
    accionDatos.retraso_minutos = String(retrasoMinutos);
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
