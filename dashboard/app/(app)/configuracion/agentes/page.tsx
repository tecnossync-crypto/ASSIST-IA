import { Headset, KeyRound, Circle, Layers } from "lucide-react";
import { listarAgentes, listarColas, obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { EnrutamientoForm } from "@/components/EnrutamientoForm";
import { ColaEnrutamientoSelect } from "@/components/ColaEnrutamientoSelect";
import { BotonAccion } from "@/components/BotonAccion";
import { NuevoAgenteForm } from "@/components/NuevoAgenteForm";
import { eliminarAgenteAction, crearColaAction, eliminarColaAction } from "./actions";

const ETIQUETAS_ROL: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  operador: "Agente",
};

const ESTADO_PRESENCIA: Record<string, { etiqueta: string; punto: string }> = {
  disponible: { etiqueta: "Disponible ahora", punto: "fill-emerald-500 text-emerald-500" },
  descanso: { etiqueta: "En descanso", punto: "fill-amber-500 text-amber-500" },
  desconectado: { etiqueta: "Desconectado", punto: "fill-slate-300 text-slate-300" },
};

export default async function AgentesPage() {
  const [agentes, colas, empresa] = await Promise.all([listarAgentes(), listarColas(), obtenerEmpresa()]);
  const modoActual = empresa.enrutamiento_llamadas?.modo ?? "todos";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Headset}
        titulo="Agentes"
        descripcion="Quiénes reciben las llamadas normales desde el softphone del dashboard, organizados por cola."
      />

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <Layers size={16} className="text-indigo-600" />
          Colas
        </div>
        <p className="mb-4 text-xs text-muted">
          Divide el trabajo en colas (ej. "Ventas", "Soporte"). Cada una reparte sus llamadas entre los agentes
          que le asignes, con su propio modo de reparto.
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
            <div key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-ink">{c.nombre}</p>
                <p className="text-xs text-muted">{c.agentes_asignados} agente(s) asignado(s)</p>
              </div>
              <div className="flex items-center gap-3">
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

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <KeyRound size={16} className="text-indigo-600" />
          Nuevo usuario
        </div>
        <NuevoAgenteForm colas={colas} />
        <p className="mt-3 text-xs text-muted">
          Agente: entra al softphone con PIN. Supervisor: ve todo excepto Configuración (incluye Supervisión en
          vivo). Administrador: acceso total.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink-2">Usuarios registrados</h2>
        {agentes.length === 0 && (
          <p className="rounded-lg border border-dashed border-edge p-4 text-sm text-muted">
            No hay usuarios todavía.
          </p>
        )}
        {agentes.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-surface p-4"
          >
            <div className="flex items-center gap-3">
              <Circle size={9} className={(ESTADO_PRESENCIA[a.estado_presencia] ?? ESTADO_PRESENCIA.desconectado).punto} />
              <div>
                <p className="text-sm font-medium text-ink">
                  {a.nombre}{" "}
                  <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                    {ETIQUETAS_ROL[a.rol] ?? a.rol}
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {a.email} · {a.pin ? `PIN ${a.pin}` : "sin PIN"} ·{" "}
                  {a.tiene_acceso_dashboard ? "acceso dashboard" : "sin acceso dashboard"} ·{" "}
                  {a.cola_nombre ?? "Sin cola"} ·{" "}
                  {(ESTADO_PRESENCIA[a.estado_presencia] ?? ESTADO_PRESENCIA.desconectado).etiqueta}
                </p>
              </div>
            </div>
            <BotonAccion
              accion={eliminarAgenteAction.bind(null, a.id)}
              mensajeExito="Eliminado."
              mensajeConfirmar={`¿Eliminar al agente "${a.nombre}"?`}
            >
              Eliminar
            </BotonAccion>
          </div>
        ))}
      </section>
    </div>
  );
}
