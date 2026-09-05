import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/session";

// Configuración es solo para admins — un operador ni siquiera puede entrar
// escribiendo la URL directamente (el link ya está oculto en el Sidebar).
export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion();
  if (sesion?.rol !== "admin") {
    redirect("/");
  }

  return children;
}
