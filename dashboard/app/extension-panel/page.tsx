import { redirect } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { obtenerSesion } from "@/lib/session";
import { AgenteSoftphoneProvider } from "@/components/AgenteSoftphoneContext";
import { ConexionAgenteHeader } from "@/components/ConexionAgenteHeader";
import { PanelTelefono } from "@/components/PanelTelefono";
import { Softphone } from "@/components/Softphone";

/**
 * Vista mínima (sin Sidebar ni el resto del dashboard) pensada para abrirse
 * en una ventana chiquita aparte — la usa la extensión de Chrome (ver
 * /extension/) para dejar el teléfono a mano mientras se trabaja en otras
 * pestañas o apps, sin tener que dejar abierta toda la plataforma.
 */
export default async function ExtensionPanelPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login?next=/extension-panel");

  return (
    <AgenteSoftphoneProvider>
      <div className="flex h-full flex-col bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-edge px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <PhoneCall size={16} className="text-indigo-600" />
            Teléfono
          </div>
          <ConexionAgenteHeader />
        </div>
        <div className="relative flex-1">
          <PanelTelefono autoAbrir />
          <Softphone />
        </div>
      </div>
    </AgenteSoftphoneProvider>
  );
}
