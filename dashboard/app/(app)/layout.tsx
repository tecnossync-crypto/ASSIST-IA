import { Sidebar } from "@/components/Sidebar";
import { PanelTelefono } from "@/components/PanelTelefono";
import { Softphone } from "@/components/Softphone";
import { EstadoDashboardBoton } from "@/components/EstadoDashboardBoton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AgenteSoftphoneProvider } from "@/components/AgenteSoftphoneContext";
import { ConexionAgenteHeader } from "@/components/ConexionAgenteHeader";
import { LlamadasExternasWidget } from "@/components/LlamadasExternasWidget";
import { MobileNavProvider } from "@/components/MobileNavContext";
import { MobileMenuButton } from "@/components/MobileMenuButton";
import { obtenerSesion } from "@/lib/session";

// Shell de la plataforma ya autenticada: Sidebar (con quién entró), panel de
// teléfono flotante y softphone, visibles en todas las páginas EXCEPTO
// /login (que usa el layout raíz mínimo, sin esto).
//
// A propósito NO se pide acá nada del backend (contactos/llamadas/colas/
// estado del agente) — antes se pedía todo de una vez, sin caché, y como
// este layout envuelve TODAS las páginas, cada cambio de sección volvía a
// disparar esas llamadas y tapaba la pantalla con el loading de marca. Cada
// widget (PanelTelefono, EstadoDashboardBoton) pide lo suyo por su cuenta
// desde el cliente — así el layout resuelve al instante y navegar entre
// secciones no muestra ninguna pantalla de carga.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion();

  return (
    <AgenteSoftphoneProvider>
      <MobileNavProvider>
        <div className="flex h-full">
          <Sidebar sesion={sesion} />
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-edge bg-surface/80 px-3 py-2.5 backdrop-blur sm:px-4 md:justify-end md:px-6">
              <MobileMenuButton />
              <div className="flex items-center gap-3">
                {sesion && <EstadoDashboardBoton usuarioId={sesion.usuarioId} />}
                <ConexionAgenteHeader />
                <ThemeToggle />
              </div>
            </div>
            <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-5 sm:px-6 sm:py-8">{children}</main>
          </div>
          <PanelTelefono />
          <Softphone />
          <LlamadasExternasWidget />
        </div>
      </MobileNavProvider>
    </AgenteSoftphoneProvider>
  );
}
