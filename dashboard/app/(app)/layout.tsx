import { Sidebar } from "@/components/Sidebar";
import { PanelTelefono } from "@/components/PanelTelefono";
import { Softphone } from "@/components/Softphone";
import { listarContactos, listarLlamadas, listarColas } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

// Shell de la plataforma ya autenticada: Sidebar (con quién entró), panel de
// teléfono flotante y softphone, visibles en todas las páginas EXCEPTO
// /login (que usa el layout raíz mínimo, sin esto).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion();
  // Un agente (rol operador) solo ve, en "Recientes" del panel de teléfono,
  // las llamadas de su propia cola.
  const colaId = sesion?.rol === "operador" ? sesion?.colaId : undefined;

  const [contactos, recientes, colas] = await Promise.all([
    listarContactos().catch(() => []),
    listarLlamadas({ limite: 15, colaId }).catch(() => []),
    listarColas().catch(() => []),
  ]);

  return (
    <div className="flex h-full">
      <Sidebar sesion={sesion} />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
      </div>
      <PanelTelefono contactos={contactos} recientes={recientes} colas={colas} />
      <Softphone />
    </div>
  );
}
