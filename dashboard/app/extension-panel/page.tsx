import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/session";
import { AgenteSoftphoneProvider } from "@/components/AgenteSoftphoneContext";
import { SoftphoneProvider } from "@/components/SoftphoneContext";
import { PanelTelefono } from "@/components/PanelTelefono";

/**
 * Vista mínima (sin Sidebar ni el resto del dashboard) pensada para abrirse
 * en una ventana chiquita aparte — la usa la extensión de Chrome (ver
 * /extension/) para dejar el teléfono a mano mientras se trabaja en otras
 * pestañas o apps, sin tener que dejar abierta toda la plataforma.
 *
 * El panel ocupa toda la ventana (modo "ventana"): se entra con la misma
 * cuenta del dashboard y desde ahí mismo se pone Activo / En pausa / Inactivo.
 */
export default async function ExtensionPanelPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login?next=/extension-panel");

  return (
    <AgenteSoftphoneProvider usuario={{ usuarioId: sesion.usuarioId, nombre: sesion.nombre }}>
      <SoftphoneProvider>
        <div className="h-full bg-surface">
          <PanelTelefono modo="ventana" usuarioId={sesion.usuarioId} nombre={sesion.nombre} />
        </div>
      </SoftphoneProvider>
    </AgenteSoftphoneProvider>
  );
}
