import { Headset, KeyRound, Circle, Layers } from "lucide-react";
import { listarAgentes, listarColas, obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { EnrutamientoForm } from "@/components/EnrutamientoForm";
import { ColaEnrutamientoSelect } from "@/components/ColaEnrutamientoSelect";
import { BotonAccion } from "@/components/BotonAccion";
import { crearAgenteAction, eliminarAgenteAction, crearColaAction, eliminarColaAction } from "./actions";

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

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Layers size={16} className="text-indigo-600" />
          Colas
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Divide el trabajo en colas (ej. "Ventas", "Soporte"). Cada una reparte sus llamadas entre los agentes
          que le asignes, con su propio modo de reparto.
        </p>

        <form action={crearColaAction} className="mb-4 flex gap-2">
          <input
            name="nombre"
            required
            placeholder="Nombre de la cola (ej. Ventas)"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="ts-brand-button rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            Crear cola
          </button>
        </form>

        <div className="flex flex-col divide-y divide-slate-100">
          {colas.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{c.nombre}</p>
                <p className="text-xs text-slate-400">{c.agentes_asignados} agente(s) asignado(s)</p>
              </div>
              <div className="flex items-center gap-3">
                <ColaEnrutamientoSelect colaId={c.id} modoActual={c.enrutamiento?.modo ?? "todos"} />
                <BotonAccion
                  accion={() => eliminarColaAction(c.id)}
                  mensajeExito="Eliminada."
                  mensajeConfirmar={`¿Eliminar la cola "${c.nombre}"? Sus agentes quedarán sin cola.`}
                >
                  Eliminar
                </BotonAccion>
              </div>
            </div>
          ))}
          {colas.length === 0 && <p className="py-2 text-sm text-slate-400">No hay colas todavía.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Headset size={16} className="text-indigo-600" />
          Reparto general (agentes sin cola asignada)
        </div>
        <EnrutamientoForm modoActual={modoActual} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <KeyRound size={16} className="text-indigo-600" />
          Nuevo agente
        </div>
        <form action={crearAgenteAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="nombre"
            required
            placeholder="Nombre"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            name="pin"
            required
            inputMode="numeric"
            pattern="\d{4,6}"
            title="4 a 6 dígitos"
            placeholder="PIN (4-6 dígitos)"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <select
            name="colaId"
            defaultValue=""
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Sin cola</option>
            {colas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="ts-brand-button col-span-full self-start rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            Agregar agente
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-400">
          El agente usa este PIN para entrar al softphone del dashboard (no necesita contraseña por ahora).
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Agentes registrados</h2>
        {agentes.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-400">
            No hay agentes todavía.
          </p>
        )}
        {agentes.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center gap-3">
              <Circle
                size={9}
                className={a.disponible ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300"}
              />
              <div>
                <p className="text-sm font-medium text-slate-800">{a.nombre}</p>
                <p className="text-xs text-slate-500">
                  {a.email} · PIN {a.pin} · {a.cola_nombre ?? "Sin cola"} ·{" "}
                  {a.disponible ? "Disponible ahora" : "Desconectado"}
                </p>
              </div>
            </div>
            <BotonAccion
              accion={() => eliminarAgenteAction(a.id)}
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
