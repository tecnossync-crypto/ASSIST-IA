import { Workflow, Tag, ClipboardList, PhoneCall } from "lucide-react";
import { listarFlujosTrabajo, obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { FlujoTrabajoForm } from "@/components/FlujoTrabajoForm";
import { BotonAccion } from "@/components/BotonAccion";
import { formatFechaHora } from "@/lib/format";
import { activarFlujoAction, desactivarFlujoAction, eliminarFlujoAction } from "./actions";

const ETIQUETAS_DISPARADOR: Record<string, string> = {
  llamada_completada: "Llamada completada",
  llamada_transferida: "Llamada transferida",
  llamada_no_contesta: "No contesta / falla",
  etiqueta_agregada: "Se agrega una etiqueta",
};

function describirDisparador(f: { disparador: string; disparador_datos: { etiqueta?: string } }): string {
  if (f.disparador === "etiqueta_agregada") {
    return `se agrega la etiqueta "${f.disparador_datos?.etiqueta ?? "?"}"`;
  }
  return ETIQUETAS_DISPARADOR[f.disparador] ?? f.disparador;
}

function describirAccion(f: {
  accion: string;
  accion_datos: { etiqueta?: string; tipo?: string; modo?: string; fecha?: string };
}): string {
  if (f.accion === "agregar_etiqueta") return `agregar etiqueta "${f.accion_datos.etiqueta}"`;
  if (f.accion === "llamar_contacto") {
    return f.accion_datos.modo === "programada"
      ? `llamar con IA el ${formatFechaHora(f.accion_datos.fecha ?? "")}`
      : "llamar con IA de inmediato";
  }
  return `crear solicitud (${f.accion_datos.tipo ?? "seguimiento"})`;
}

export default async function FlujosTrabajoPage() {
  const [flujos, empresa] = await Promise.all([listarFlujosTrabajo(), obtenerEmpresa()]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Workflow}
        titulo="Flujos de trabajo"
        descripcion="Reglas automáticas: cuando pasa algo (una llamada termina así, se agrega una etiqueta), la plataforma hace algo por ti."
      />

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <Workflow size={16} className="text-indigo-600" />
          Nueva regla
        </div>
        <FlujoTrabajoForm etiquetas={empresa.etiquetas_disponibles ?? []} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink-2">Reglas activas</h2>
        {flujos.length === 0 && (
          <p className="rounded-lg border border-dashed border-edge p-4 text-sm text-muted">
            No hay flujos de trabajo todavía.
          </p>
        )}
        {flujos.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-surface p-4"
          >
            <div className="flex items-start gap-3">
              {f.accion === "agregar_etiqueta" ? (
                <Tag size={16} className="mt-0.5 text-indigo-500" />
              ) : f.accion === "llamar_contacto" ? (
                <PhoneCall size={16} className="mt-0.5 text-indigo-500" />
              ) : (
                <ClipboardList size={16} className="mt-0.5 text-indigo-500" />
              )}
              <div>
                <p className="text-sm font-medium text-ink">{f.nombre}</p>
                <p className="text-xs text-muted">
                  Cuando: {describirDisparador(f)} · Entonces: {describirAccion(f)}
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
