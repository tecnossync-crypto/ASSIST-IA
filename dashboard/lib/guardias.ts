import { obtenerContacto } from "./api";
import { permisosDe } from "./permisos";
import { obtenerSesion } from "./session";

/**
 * Comprobaciones de permiso para server actions de contactos. El middleware solo protege por URL; esto
 * comprueba además que ESE contacto entra en el alcance del rol (por ejemplo, "solo los suyos").
 * Lanza un Error con mensaje legible si no corresponde.
 */
export async function exigirContacto(contactoId: string, accion: "editar" | "eliminar" | "propietario"): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const p = permisosDe(sesion);

  if (p.contactos === "ninguno") throw new Error("Tu rol no tiene acceso a Contactos.");
  if (accion === "editar" && !p.contactos_editar) throw new Error("Tu rol no puede editar contactos.");
  if (accion === "eliminar" && !p.contactos_eliminar) throw new Error("Tu rol no puede eliminar contactos.");
  // Repartir la cartera es de quien ve todos los contactos y puede editarlos.
  if (accion === "propietario" && !(p.contactos === "todos" && p.contactos_editar)) {
    throw new Error("Tu rol no puede cambiar el propietario de un contacto.");
  }

  if (p.contactos === "propios") {
    try {
      await obtenerContacto(contactoId, sesion.usuarioId);
    } catch {
      throw new Error("Ese contacto no está entre los tuyos.");
    }
  }
}
