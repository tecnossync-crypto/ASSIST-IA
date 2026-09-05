import { Building2, Archive, Download } from "lucide-react";
import { obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { FormConFeedback } from "@/components/FormConFeedback";
import { guardarEmpresaAction, guardarRetencionAction } from "./actions";

export default async function EmpresaConfigPage() {
  const empresa = await obtenerEmpresa();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader Icon={Building2} titulo="Empresa" descripcion="Datos básicos de tu negocio." />

      <FormConFeedback
        action={guardarEmpresaAction}
        className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="nombre" className="text-sm font-medium text-slate-700">
            Nombre de la empresa
          </label>
          <input
            id="nombre"
            name="nombre"
            defaultValue={empresa.nombre}
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="numeros_transferencia" className="text-sm font-medium text-slate-700">
            Número(s) de transferencia
          </label>
          <input
            id="numeros_transferencia"
            name="numeros_transferencia"
            defaultValue={empresa.numeros_transferencia?.join(", ")}
            placeholder="+18095551234, +18095555678"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="text-xs text-slate-400">Separados por coma si son varios.</p>
        </div>
      </FormConFeedback>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Archive size={16} className="text-indigo-600" />
          Grabaciones
        </div>

        <FormConFeedback action={guardarRetencionAction} submitLabel="Guardar" className="mb-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="retencion_dias" className="text-sm font-medium text-slate-700">
              Días que se conservan antes de borrarse
            </label>
            <input
              id="retencion_dias"
              name="retencion_dias"
              type="number"
              min={1}
              defaultValue={empresa.retencion_grabaciones_dias}
              className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-400">
              Pasado este tiempo se borra el archivo de audio solo (la transcripción y el resumen de la llamada se
              quedan siempre). Por defecto, 30 días.
            </p>
          </div>
        </FormConFeedback>

        <div className="flex items-center justify-between rounded-md bg-slate-50 p-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Exportar todas las grabaciones</p>
            <p className="text-xs text-slate-400">Descarga un .zip con el audio de todas las llamadas grabadas hasta ahora.</p>
          </div>
          <a
            href="/api/grabaciones/exportar"
            className="ts-brand-button flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white shadow shadow-indigo-500/30"
          >
            <Download size={13} />
            Descargar .zip
          </a>
        </div>
      </section>
    </div>
  );
}
