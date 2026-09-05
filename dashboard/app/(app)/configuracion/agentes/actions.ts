"use server";

import { revalidatePath } from "next/cache";
import {
  crearAgente,
  eliminarAgente,
  actualizarEnrutamiento,
  crearCola,
  actualizarEnrutamientoCola,
  eliminarCola,
  type ModoEnrutamiento,
} from "@/lib/api";
import { auditar } from "@/lib/session";

export async function crearAgenteAction(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const colaId = String(formData.get("colaId") ?? "").trim();
  if (!nombre || !email || !pin) return;

  await crearAgente({ nombre, email, pin, colaId: colaId || null });
  revalidatePath("/configuracion/agentes");
  await auditar("crear", "agente", { nombre, email });
}

export async function eliminarAgenteAction(formData: FormData) {
  const id = String(formData.get("id"));
  await eliminarAgente(id);
  revalidatePath("/configuracion/agentes");
  await auditar("eliminar", "agente", { id });
}

export async function actualizarEnrutamientoAction(formData: FormData) {
  const modo = String(formData.get("modo") ?? "todos") as ModoEnrutamiento;
  await actualizarEnrutamiento(modo);
  revalidatePath("/configuracion/agentes");
  await auditar("actualizar", "enrutamiento_general", { modo });
}

export async function crearColaAction(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return;
  await crearCola(nombre);
  revalidatePath("/configuracion/agentes");
  await auditar("crear", "cola", { nombre });
}

export async function actualizarEnrutamientoColaAction(formData: FormData) {
  const id = String(formData.get("id"));
  const modo = String(formData.get("modo") ?? "todos") as ModoEnrutamiento;
  await actualizarEnrutamientoCola(id, modo);
  revalidatePath("/configuracion/agentes");
  await auditar("actualizar", "cola", { id, modo });
}

export async function eliminarColaAction(formData: FormData) {
  const id = String(formData.get("id"));
  await eliminarCola(id);
  revalidatePath("/configuracion/agentes");
  await auditar("eliminar", "cola", { id });
}
