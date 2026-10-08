import { Network, Layers, Headset, GitFork, PhoneForwarded, ClipboardList, Timer } from "lucide-react";
import { ResumenTransferenciaForm } from "@/components/ResumenTransferenciaForm";
import { FormConFeedback } from "@/components/FormConFeedback";
import { guardarColaEsperaAction } from "./actions";
import { listarColas, obtenerEmpresa, obtenerEnrutamiento } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { CentralPropiaForm } from "@/components/CentralPropiaForm";
import { EnrutamientoForm } from "@/components/EnrutamientoForm";
import { ColaEnrutamientoSelect } from "@/components/ColaEnrutamientoSelect";
import { ColaDestinoSelect } from "@/components/ColaDestinoSelect";
import { DestinoEmpresaForm } from "@/components/DestinoEmpresaForm";
import { ExtensionesCentral } from "@/components/ExtensionesCentral";
import { BotonAccion } from "@/components/BotonAccion";
import { crearColaAction, eliminarColaAction } from "../agentes/actions";

export default async function EnrutamientoPage() {
  const [colas, empresa, enrutamiento] = await Promise.all([listarColas(), obtenerEmpresa(), obtenerEnrutamiento()]);
  const modoActual = empresa.enrutamiento_llamadas?.modo ?? "todos";
  const usaCentral = enrutamiento.destino !== "plataforma" || colas.some((c) => c.destino_llamadas && c.destino_llamadas !== "plataforma");
  const centralLista = empresa.central_propia_activa && empresa.central_propia_entrante;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Network}
        titulo="Enrutamiento"
        descripcion="Dónde se atienden las llamadas que la IA transfiere, a qué extensiones y departamentos, y cómo se reparten."
      />

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <GitFork size={16} className="text-indigo-600" />
          ¿Dónde se atienden las llamadas?
        </div>
        <p className="mb-4 text-xs text-muted">
          Cuando la IA pasa una llamada a una persona. Cada departamento puede tener su propia elección más abajo; si no
          la tiene, usa esta.
        </p>
        <DestinoEmpresaForm destinoActual={enrutamiento.destino} />
        {usaCentral && !centralLista && (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Elegiste usar los teléfonos de la central, pero la central propia no está activa para llamadas entrantes
            (más abajo, en "Central telefónica propia"). Mientras no lo esté, se usan solo los agentes de la plataforma.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Timer size={16} className="text-indigo-600" />
          Cola de espera
        </div>
        <p className="mb-4 text-xs text-muted">
          Cuando la IA transfiere una llamada y ningún asesor de la plataforma está activo, el cliente espera en línea
          con música en vez de que se le cuelgue. Los asesores ven la cola en la pestaña "Cola" del panel de teléfono y
          eligen "Atender". Solo aplica a llamadas que se atienden en la plataforma; los teléfonos de la central se
          gestionan con su propia cola en la central.
        </p>
        <FormConFeedback action={guardarColaEsperaAction}>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="activa" defaultChecked={enrutamiento.colaEspera.activa} />
            Activar la cola de espera
          </label>
          <div className="mt-3 flex items-center gap-2 text-sm text-ink-2">
            Colgar si espera más de
            <input
              name="maxMinutos"
              type="number"
              min={1}
              max={60}
              defaultValue={enrutamiento.colaEspera.maxMinutos}
              className="w-20 rounded-md border border-edge px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            minutos
          </div>
        </FormConFeedback>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <ClipboardList size={16} className="text-indigo-600" />
          Contexto para el vendedor
        </div>
        <p className="mb-4 text-xs text-muted">
          Lo ve quien tenga abierto el panel de teléfono del dashboard (o la ventana de la extensión de Chrome): al
          transferirse la llamada, el panel se abre solo en la pestaña &quot;Contexto&quot;. Quien contesta solo desde un
          teléfono de escritorio y no tiene el dashboard abierto no lo verá.
        </p>
        <ResumenTransferenciaForm activoInicial={enrutamiento.mostrarResumen} />
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <PhoneForwarded size={16} className="text-indigo-600" />
          Extensiones de la central
        </div>
        <p className="mb-4 text-xs text-muted">
          Carga las extensiones y asígnalas a un departamento. Al transferir a la central suenan a la vez todas las
          extensiones activas ("Suena") de ese departamento; si no tiene ninguna, las generales. Apaga "Suena" para
          dejar una extensión fuera sin borrarla.
        </p>
        <ExtensionesCentral
          extensiones={enrutamiento.extensiones}
          colas={colas.map((c) => ({ id: c.id, nombre: c.nombre }))}
        />
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <Layers size={16} className="text-indigo-600" />
          Departamentos (colas)
        </div>
        <p className="mb-4 text-xs text-muted">
          Divide el trabajo en departamentos (ej. "Cobranza", "Siniestros"). Cada uno reparte las llamadas entre los
          agentes que le asignes (en Configuración → Agentes) con su propio modo de reparto, y puede tener su propio
          destino.
        </p>

        <form action={crearColaAction} className="mb-4 flex gap-2">
          <input
            name="nombre"
            required
            placeholder="Nombre del departamento (ej. Cobranza)"
            className="flex-1 rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="ts-brand-button rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            Crear
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
                <ColaDestinoSelect colaId={c.id} destinoActual={c.destino_llamadas} />
                <ColaEnrutamientoSelect colaId={c.id} modoActual={c.enrutamiento?.modo ?? "todos"} />
                <BotonAccion
                  accion={eliminarColaAction.bind(null, c.id)}
                  mensajeExito="Eliminada."
                  mensajeConfirmar={`¿Eliminar el departamento "${c.nombre}"? Sus agentes quedarán sin cola y sus extensiones pasarán a "General".`}
                >
                  Eliminar
                </BotonAccion>
              </div>
            </div>
          ))}
          {colas.length === 0 && <p className="py-2 text-sm text-muted">No hay departamentos todavía.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <Headset size={16} className="text-indigo-600" />
          Reparto general (agentes sin departamento)
        </div>
        <EnrutamientoForm modoActual={modoActual} />
      </section>

      <CentralPropiaForm empresa={empresa} />
    </div>
  );
}
