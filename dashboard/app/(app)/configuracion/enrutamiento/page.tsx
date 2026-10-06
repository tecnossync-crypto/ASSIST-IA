import { Network, Layers, Headset } from "lucide-react";
import { listarColas, obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { CentralPropiaForm } from "@/components/CentralPropiaForm";
import { EnrutamientoForm } from "@/components/EnrutamientoForm";
import { ColaEnrutamientoSelect } from "@/components/ColaEnrutamientoSelect";
import { ColaExtensionCentralPropia } from "@/components/ColaExtensionCentralPropia";
import { BotonAccion } from "@/components/BotonAccion";
import { crearColaAction, eliminarColaAction } from "../agentes/actions";

export default async function EnrutamientoPage() {
  const [colas, empresa] = await Promise.all([listarColas(), obtenerEmpresa()]);
  const modoActual = empresa.enrutamiento_llamadas?.modo ?? "todos";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Network}
        titulo="Enrutamiento"
        descripcion="Por dónde salen las llamadas y a quién se reparten: tu central telefónica, las colas y su reparto."
      />

      <CentralPropiaForm empresa={empresa} />

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <Layers size={16} className="text-indigo-600" />
          Colas
        </div>
        <p className="mb-4 text-xs text-muted">
          Divide el trabajo en colas o departamentos (ej. "Ventas", "Soporte"). Cada una reparte sus llamadas entre
          los agentes que le asignes (en Configuración → Agentes) con su propio modo de reparto. La extensión de la
          central es el respaldo: se marca solo si en ese momento no hay ningún agente de la plataforma disponible.
        </p>

        <form action={crearColaAction} className="mb-4 flex gap-2">
          <input
            name="nombre"
            required
            placeholder="Nombre de la cola (ej. Ventas)"
            className="flex-1 rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="ts-brand-button rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            Crear cola
          </button>
        </form>

        <div className="flex flex-col divide-y divide-edge">
          {colas.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-ink">{c.nombre}</p>
                <p className="text-xs text-muted">{c.agentes_asignados} agente(s) asignado(s)</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <ColaExtensionCentralPropia colaId={c.id} valorInicial={c.extension_central_propia} />
                <ColaEnrutamientoSelect colaId={c.id} modoActual={c.enrutamiento?.modo ?? "todos"} />
                <BotonAccion
                  accion={eliminarColaAction.bind(null, c.id)}
                  mensajeExito="Eliminada."
                  mensajeConfirmar={`¿Eliminar la cola "${c.nombre}"? Sus agentes quedarán sin cola.`}
                >
                  Eliminar
                </BotonAccion>
              </div>
            </div>
          ))}
          {colas.length === 0 && <p className="py-2 text-sm text-muted">No hay colas todavía.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <Headset size={16} className="text-indigo-600" />
          Reparto general (agentes sin cola asignada)
        </div>
        <EnrutamientoForm modoActual={modoActual} />
      </section>
    </div>
  );
}
