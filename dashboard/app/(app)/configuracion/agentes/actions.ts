"use server";

import { randomBytes } from "node:crypto";
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

export interface EstadoCrearAgente {
  error?: string;
  passwordGenerada?: string;
  nombreCreado?: string;
  emailCreado?: string;
}

// Contraseña temporal legible (evita caracteres ambiguos como 0/O, 1/l/I).
function generarPasswordTemporal(): string {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += alfabeto[b % alfabeto.length];
  return out;
}

export async function crearAgenteAction(
  _prevState: EstadoCrearAgente | null,
  formData: FormData
): Promise<EstadoCrearAgente> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const rol = String(formData.get("rol") ?? "operador").trim();
  const colaId = String(formData.get("colaId") ?? "").trim();
  // Admin y supervisor siempre necesitan entrar al dashboard completo; para
  // un agente (operador) es opcional que además tenga acceso al dashboard.
  const conAcceso = rol !== "operador" || formData.get("conAcceso") === "on";

  if (!nombre || !email) return { error: "Nombre y email son requeridos." };
  if (!conAcceso && !pin) {
    return { error: "Un agente necesita un PIN (softphone) o acceso al dashboard." };
  }

  const passwordGenerada = conAcceso ? generarPasswordTemporal() : undefined;

  try {
    await crearAgente({
      nombre,
      email,
      pin: pin || undefined,
      password: passwordGenerada,
      rol,
      colaId: colaId || null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando el usuario." };
  }

  revalidatePath("/configuracion/agentes");
  await auditar("crear", "agente", { nombre, email, rol });
  return { passwordGenerada, nombreCreado: nombre, emailCreado: email };
}

export async function eliminarAgenteAction(id: string) {
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

export async function eliminarColaAction(id: string) {
  await eliminarCola(id);
  revalidatePath("/configuracion/agentes");
  await auditar("eliminar", "cola", { id });
}
