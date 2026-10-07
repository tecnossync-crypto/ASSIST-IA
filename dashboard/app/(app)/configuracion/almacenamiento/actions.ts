"use server";

import { revalidatePath } from "next/cache";
import {
  actualizarRetencionGrabaciones,
  guardarCarpetaZoho,
  desconectarZoho,
  eliminarTodasGrabaciones,
} from "@/lib/api";
import { auditar, obtenerSesion } from "@/lib/session";

export async function borrarTodasGrabacionesAction(): Promise<{ borradas?: number; pendientes?: number; error?: string }> {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "admin") return { error: "Solo un administrador puede borrar las grabaciones." };
  try {
    const r = await eliminarTodasGrabaciones();
    revalidatePath("/configuracion/almacenamiento");
    await auditar("eliminar", "grabaciones", { borradas: r.borradas, pendientes: r.pendientes });
    return r;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudieron borrar las grabaciones." };
  }
}

export async function guardarRetencionAction(formData: FormData) {
  const dias = parseInt(String(formData.get("retencion_dias") ?? "30"), 10);
  if (!Number.isFinite(dias) || dias < 1) return;

  await actualizarRetencionGrabaciones(dias);
  revalidatePath("/configuracion/almacenamiento");
  await auditar("actualizar", "retencion_grabaciones", { dias });
}

export async function guardarCarpetaZohoAction(formData: FormData) {
  const carpetaId = String(formData.get("carpeta_id") ?? "").trim();
  if (!carpetaId) return;

  await guardarCarpetaZoho(carpetaId);
  revalidatePath("/configuracion/almacenamiento");
  await auditar("actualizar", "zoho_workdrive_carpeta", { carpetaId });
}

export async function desconectarZohoAction() {
  await desconectarZoho();
  revalidatePath("/configuracion/almacenamiento");
  await auditar("desconectar", "zoho_workdrive", {});
}
