import { Network, Layers, Headset, GitFork, PhoneForwarded, ClipboardList, Timer, Settings2, Building2, Phone } from "lucide-react";
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
import { SeccionConfig } from "@/components/SeccionConfig";
import { PestanasConfig, type PestanaConfig } from "@/components/PestanasConfig";
import { crearColaAction, eliminarColaAction } from "../agentes/actions";

const PESTANAS: PestanaConfig[] = [
  { id: "general", etiqueta: "General", Icon: Settings2 },
  { id: "departamentos", etiqueta: "Departamentos", Icon: Building2 },
  { id: "central", etiqueta: "Central telefónica", Icon: Phone },
];

const CAMPO =
  "rounded-md border border-edge px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default async function EnrutamientoPage({
  searchParams,
}: {
  searchParams: Promise<{ seccion?: string }>;
}) {
  const { seccion } = await searchParams;
  const activa = PESTANAS.some((p) => p.id === seccion) ? (seccion as string) : "general";

  const [colas, empresa, enrutamiento] = await Promise.all([listarColas(), obtenerEmpresa(), obtenerEnrutamiento()]);
  const modoActual = empresa.enrutamiento_llamadas?.modo ?? "todos";
  const usaCentral =
    enrutamiento.destino !== "plataforma" || colas.some((c) => c.destino_llamadas && c.destino_llamadas !== "plataforma");
  const centralLista = empresa.central_propia_activa && empresa.central_propia_entrante;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Network}
        titulo="Enrutamiento"
        descripcion="Qué pasa cuando la IA transfiere una llamada a una persona: dónde se atiende, quién la recibe y cómo se reparte."
      />

      <PestanasConfig basePath="/configuracion/enrutamiento" pestanas={PESTANAS} activa={activa} />

      {activa === "general" && (
        <div className="flex flex-col gap-5">
          <SeccionConfig
            Icon={GitFork}
            titulo="¿Dónde se atienden las llamadas?"
            descripcion="Cuando la IA pasa una llamada a una persona. Cada departamento puede tener su propia elección (pestaña Departamentos); si no la tiene, usa esta."
          >
            <DestinoEmpresaForm destinoActual={enrutamiento.destino} />
            {usaCentral && !centralLista && (
              <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                Elegiste usar los teléfonos de la central, pero la central propia no está activa para llamadas
                entrantes (pestaña &quot;Central telefónica&quot;). Mientras no lo esté, se usan solo los agentes de la
                plataforma.
              </p>
            )}
          </SeccionConfig>

          <SeccionConfig
            Icon={Timer}
            titulo="Cola de espera"
            descripcion="Si ningún asesor de la plataforma está activo, el cliente espera en línea con música en vez de que se le cuelgue. Los asesores ven la cola en la pestaña Cola del panel de teléfono y eligen Atender. Solo aplica a llamadas atendidas en la plataforma; los teléfonos de la central tienen su propia cola en la central."
          >
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
                  className={"w-20 " + CAMPO}
                />
                minutos
              </div>
            </FormConFeedback>
          </SeccionConfig>

          <SeccionConfig
            Icon={ClipboardList}
            titulo="Contexto para el vendedor"
            descripcion={
              <>
                Al transferirse la llamada, el panel de teléfono del dashboard (o la ventana de la extensión de Chrome)
                se abre en la pestaña &quot;Contexto&quot; con el resumen de la conversación. Quien contesta solo desde
                un teléfono de escritorio y no tiene el dashboard abierto no lo verá.
              </>
            }
          >
            <ResumenTransferenciaForm activoInicial={enrutamiento.mostrarResumen} />
          </SeccionConfig>
        </div>
      )}

      {activa === "departamentos" && (
        <div className="flex flex-col gap-5">
          <SeccionConfig
            Icon={Layers}
            titulo="Departamentos"
            descripcion={
              <>
                Divide el trabajo (ej. &quot;Cobranza&quot;, &quot;Siniestros&quot;). Cada departamento tiene su propio
                destino y su propio modo de reparto entre los agentes que le asignes en Configuración → Agentes.
              </>
            }
          >
            <form action={crearColaAction} className="mb-4 flex gap-2">
              <input
                name="nombre"
                required
                placeholder="Nombre del departamento (ej. Cobranza)"
                className={"flex-1 px-3 py-2 " + CAMPO}
              />
              <button
                type="submit"
                className="ts-brand-button rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
              >
                Crear
              </button>
            </form>

            <div className="flex flex-col gap-3">
              {colas.map((c) => (
                <div key={c.id} className="rounded-lg border border-edge p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{c.nombre}</p>
                      <p className="text-xs text-muted">{c.agentes_asignados} agente(s) asignado(s)</p>
                    </div>
                    <BotonAccion
                      accion={eliminarColaAction.bind(null, c.id)}
                      mensajeExito="Eliminada."
                      mensajeConfirmar={`¿Eliminar el departamento "${c.nombre}"? Sus agentes quedarán sin cola y sus extensiones pasarán a "General".`}
                    >
                      Eliminar
                    </BotonAccion>
                  </div>
                  <div className="mt-3 grid gap-3 border-t border-edge pt-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted">Dónde se atiende</p>
                      <ColaDestinoSelect colaId={c.id} destinoActual={c.destino_llamadas} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted">Cómo se reparten las llamadas</p>
                      <ColaEnrutamientoSelect colaId={c.id} modoActual={c.enrutamiento?.modo ?? "todos"} />
                    </div>
                  </div>
                </div>
              ))}
              {colas.length === 0 && (
                <p className="rounded-lg border border-dashed border-edge py-6 text-center text-sm text-muted">
                  No hay departamentos todavía. Crea el primero arriba.
                </p>
              )}
            </div>
          </SeccionConfig>

          <SeccionConfig
            Icon={Headset}
            titulo="Reparto general"
            descripcion="Cómo se reparten las llamadas entre los agentes que no pertenecen a ningún departamento."
          >
            <EnrutamientoForm modoActual={modoActual} />
          </SeccionConfig>
        </div>
      )}

      {activa === "central" && (
        <div className="flex flex-col gap-5">
          <SeccionConfig
            Icon={PhoneForwarded}
            titulo="Extensiones de la central"
            descripcion={
              <>
                Carga las extensiones y asígnalas a un departamento. Al transferir a la central suenan a la vez todas
                las extensiones activas (&quot;Suena&quot;) de ese departamento; si no tiene ninguna, las generales.
                Apaga &quot;Suena&quot; para dejar una extensión fuera sin borrarla.
              </>
            }
          >
            <ExtensionesCentral
              extensiones={enrutamiento.extensiones}
              colas={colas.map((c) => ({ id: c.id, nombre: c.nombre }))}
            />
          </SeccionConfig>

          <CentralPropiaForm empresa={empresa} />
        </div>
      )}
    </div>
  );
}
