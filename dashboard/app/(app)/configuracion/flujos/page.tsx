import { Workflow, Tag, ClipboardList } from "lucide-react";
import { listarFlujosTrabajo } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { FlujoTrabajoForm } from "@/components/FlujoTrabajoForm";
import { BotonAccion } from "@/components/BotonAccion";
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
      <ConfiguracionHeader
        Icon={Workflow}
        titulo="Flujos de trabajo"
        descripcion="Reglas automáticas: cuando una llamada termina de cierta forma, la plataforma hace algo por ti."
      />

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
                <BotonAccion
                  accion={desactivarFlujoAction.bind(null, f.id)}
                  mensajeExito="Desactivada."
                  className="text-xs text-amber-700 hover:underline"
                >
                  Desactivar
                </BotonAccion>
              ) : (
                <BotonAccion
                  accion={activarFlujoAction.bind(null, f.id)}
                  mensajeExito="Activada."
                  className="text-xs text-indigo-700 hover:underline"
                >
                  Activar
                </BotonAccion>
              )}
              <BotonAccion
                accion={eliminarFlujoAction.bind(null, f.id)}
                mensajeExito="Eliminada."
                mensajeConfirmar={`¿Eliminar la regla "${f.nombre}"?`}
              >
                Eliminar
              </BotonAccion>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
