"use server";

import { revalidatePath } from "next/cache";
import {
  actualizarDestinoCola,
  actualizarDestinoEmpresa,
  actualizarExtensionCentral,
  crearExtensionCentral,
  eliminarExtensionCentral,
  type DestinoLlamadas,
} from "@/lib/api";
import { auditar } from "@/lib/session";

const DESTINOS: DestinoLlamadas[] = ["plataforma", "central", "ambos"];

function destinoValido(valor: FormDataEntryValue | null): DestinoLlamadas | null {
  const v = String(valor ?? "");
  return (DESTINOS as string[]).includes(v) ? (v as DestinoLlamadas) : null;
}

export interface ResultadoGuardado {
  ok?: boolean;
  error?: string;
}

// Devuelven el error en vez de tirarlo: una Server Action que lanza una
// excepción en producción solo muestra un mensaje genérico (o nada), y el
// selector parecía "deshacerse solo" sin decir por qué.
export async function guardarDestinoEmpresaAction(formData: FormData): Promise<ResultadoGuardado> {
  const destino = destinoValido(formData.get("destino"));
  if (!destino) return { error: "Destino no válido." };
  try {
    await actualizarDestinoEmpresa(destino);
    revalidatePath("/configuracion/enrutamiento");
    await auditar("actualizar", "enrutamiento_destino", { destino });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
  return { ok: true };
}

export async function guardarDestinoColaAction(formData: FormData): Promise<ResultadoGuardado> {
  const id = String(formData.get("id"));
  // "" = usar el destino de la empresa.
  const destino = destinoValido(formData.get("destino"));
  try {
    await actualizarDestinoCola(id, destino);
    revalidatePath("/configuracion/enrutamiento");
    await auditar("actualizar", "cola_destino", { id, destino });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
  return { ok: true };
}

export interface EstadoExtension {
  error?: string;
  ok?: boolean;
}

export async function crearExtensionAction(
  _prev: EstadoExtension | null,
  formData: FormData
): Promise<EstadoExtension> {
  const numero = String(formData.get("numero") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const colaId = String(formData.get("colaId") ?? "").trim();
  if (!numero) return { error: "Escribe el número de la extensión." };

  try {
    await crearExtensionCentral({ numero, nombre: nombre || undefined, colaId: colaId || null });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la extensión." };
  }

  revalidatePath("/configuracion/enrutamiento");
  await auditar("crear", "extension_central", { numero, colaId: colaId || null });
  return { ok: true };
}

export async function cambiarColaExtensionAction(formData: FormData) {
  const id = String(formData.get("id"));
  const colaId = String(formData.get("colaId") ?? "").trim();
  await actualizarExtensionCentral(id, { colaId: colaId || null });
  revalidatePath("/configuracion/enrutamiento");
  await auditar("actualizar", "extension_central_cola", { id, colaId: colaId || null });
}

export async function cambiarActivaExtensionAction(formData: FormData) {
  const id = String(formData.get("id"));
  const activa = formData.get("activa") === "on";
  await actualizarExtensionCentral(id, { activa });
  revalidatePath("/configuracion/enrutamiento");
  await auditar("actualizar", "extension_central_activa", { id, activa });
}

export async function eliminarExtensionAction(id: string) {
  await eliminarExtensionCentral(id);
  revalidatePath("/configuracion/enrutamiento");
  await auditar("eliminar", "extension_central", { id });
}
