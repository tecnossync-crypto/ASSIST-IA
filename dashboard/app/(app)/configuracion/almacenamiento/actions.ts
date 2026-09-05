"use server";

import { revalidatePath } from "next/cache";
import { actualizarRetencionGrabaciones, guardarCarpetaZoho, desconectarZoho } from "@/lib/api";
import { auditar } from "@/lib/session";

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
