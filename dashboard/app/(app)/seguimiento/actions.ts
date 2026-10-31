"use server";

import { revalidatePath } from "next/cache";
import { guardarSeguimiento } from "@/lib/api";
import { auditar, obtenerSesion } from "@/lib/session";
import { permisosDe } from "@/lib/permisos";

/** Programa, edita o marca como hecho el seguimiento de un cliente. Quien ve "solo los suyos" solo toca los suyos. */
export async function guardarSeguimientoAction(
  contactoId: string,
  datos: { estado: "pendiente" | "hecho" | null; fecha?: string | null; nota?: string | null }
): Promise<{ ok?: boolean; error?: string }> {
  const sesion = await obtenerSesion();
  if (!sesion) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const p = permisosDe(sesion);
  if (p.contactos === "ninguno") return { error: "Tu rol no tiene acceso a clientes." };
  try {
    await guardarSeguimiento(contactoId, datos, p.contactos === "propios" ? sesion.usuarioId : undefined);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar el seguimiento." };
  }
  revalidatePath("/seguimiento");
  await auditar("seguimiento", "contacto", { contactoId, estado: datos.estado, fecha: datos.fecha ?? null });
  return { ok: true };
}
