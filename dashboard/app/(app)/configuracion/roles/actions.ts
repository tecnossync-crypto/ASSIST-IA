"use server";

import { revalidatePath } from "next/cache";
import { actualizarRol, actualizarRolAgente, crearRol, eliminarRol } from "@/lib/api";
import { permisosDe, type Permisos } from "@/lib/permisos";
import { auditar, obtenerSesion } from "@/lib/session";

export interface ResultadoRol {
  ok?: boolean;
  error?: string;
}

// Solo quien tiene el permiso "Roles y permisos" puede tocar esto. El middleware ya protege la ruta; esto lo
// vuelve a comprobar porque las acciones del servidor se pueden invocar sin pasar por la pantalla.
async function exigirGestionRoles(): Promise<string | null> {
  const p = permisosDe(await obtenerSesion());
  return p.configuracion && p.roles ? null : "Tu rol no puede gestionar roles y permisos.";
}

export async function crearRolAction(data: {
  nombre: string;
  descripcion: string;
  permisos: Permisos;
}): Promise<ResultadoRol> {
  const noPermitido = await exigirGestionRoles();
  if (noPermitido) return { error: noPermitido };
  if (!data.nombre.trim()) return { error: "Ponle un nombre al rol." };
  try {
    await crearRol({ nombre: data.nombre.trim(), descripcion: data.descripcion.trim(), permisos: data.permisos });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear el rol." };
  }
  revalidatePath("/configuracion/roles");
  revalidatePath("/configuracion/agentes");
  await auditar("crear", "rol", { nombre: data.nombre.trim() }).catch(() => {});
  return { ok: true };
}

export async function guardarRolAction(
  id: string,
  data: { nombre?: string; descripcion: string; permisos: Permisos }
): Promise<ResultadoRol> {
  const noPermitido = await exigirGestionRoles();
  if (noPermitido) return { error: noPermitido };
  try {
    await actualizarRol(id, { nombre: data.nombre?.trim() || undefined, descripcion: data.descripcion.trim(), permisos: data.permisos });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar el rol." };
  }
  revalidatePath("/configuracion/roles");
  revalidatePath("/configuracion/agentes");
  await auditar("actualizar", "rol", { id, permisos: data.permisos }).catch(() => {});
  return { ok: true };
}

export async function eliminarRolAction(id: string): Promise<ResultadoRol> {
  const noPermitido = await exigirGestionRoles();
  if (noPermitido) return { error: noPermitido };
  try {
    await eliminarRol(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo eliminar el rol." };
  }
  revalidatePath("/configuracion/roles");
  revalidatePath("/configuracion/agentes");
  await auditar("eliminar", "rol", { id }).catch(() => {});
  return { ok: true };
}

// Cambiar el rol de un usuario (Configuración → Agentes).
export async function cambiarRolAgenteAction(agenteId: string, rol: string): Promise<ResultadoRol> {
  const p = permisosDe(await obtenerSesion());
  if (!p.configuracion) return { error: "Tu rol no puede cambiar roles." };
  try {
    await actualizarRolAgente(agenteId, rol);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo cambiar el rol." };
  }
  revalidatePath("/configuracion/agentes");
  revalidatePath("/configuracion/roles");
  await auditar("actualizar", "agente_rol", { agenteId, rol }).catch(() => {});
  return { ok: true };
}
