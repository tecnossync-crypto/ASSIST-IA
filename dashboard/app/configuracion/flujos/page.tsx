import { Workflow, Tag, ClipboardList } from "lucide-react";
import { listarFlujosTrabajo } from "@/lib/api";
import { ConfiguracionTabs } from "@/components/ConfiguracionTabs";
import { FlujoTrabajoForm } from "@/components/FlujoTrabajoForm";
import { activarFlujoAction, desactivarFlujoAction, eliminarFlujoAction } from "./actions";

const ETIQUETAS_DISPARADOR: Record<string, string> = {
  llamada_completada: "Llamada completada",
  llamada_transferida: "Llamada transferida",
  llamada_no_contesta: "No contesta / falla",
};

export default async function FlujosTrabajoPage() {
  const flujos = await listarFlujosTrabajo();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-slate-500">
          Reglas automáticas: cuando una llamada termina de cierta forma, la plataforma hace algo por ti.
        </p>
      </div>

      <ConfiguracionTabs activo="/configuracion/flujos" />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Workflow size={16} className="text-indigo-600" />
          Nueva regla
        </div>
        <FlujoTrabajoForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Reglas activas</h2>
        {flujos.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-400">
            No hay flujos de trabajo todavía.
          </p>
        )}
        {flujos.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start gap-3">
              {f.accion === "agregar_etiqueta" ? (
                <Tag size={16} className="mt-0.5 text-indigo-500" />
              ) : (
                <ClipboardList size={16} className="mt-0.5 text-indigo-500" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-800">{f.nombre}</p>
                <p className="text-xs text-slate-500">
                  Cuando: {ETIQUETAS_DISPARADOR[f.disparador] ?? f.disparador} · Entonces:{" "}
                  {f.accion === "agregar_etiqueta"
                    ? `agregar etiqueta "${f.accion_datos.etiqueta}"`
                    : `crear solicitud (${f.accion_datos.tipo ?? "seguimiento"})`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {f.activo ? (
                <form action={desactivarFlujoAction}>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className="text-xs text-amber-700 hover:underline">
                    Desactivar
                  </button>
                </form>
              ) : (
                <form action={activarFlujoAction}>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className="text-xs text-indigo-700 hover:underline">
                    Activar
                  </button>
                </form>
              )}
              <form action={eliminarFlujoAction}>
                <input type="hidden" name="id" value={f.id} />
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Eliminar
                </button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
