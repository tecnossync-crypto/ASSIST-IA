import { HardDrive, Archive, Download, Cloud, Sparkles } from "lucide-react";
import { obtenerEmpresa, obtenerAlmacenamiento, obtenerEstadoZoho } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { FormConFeedback } from "@/components/FormConFeedback";
import { ConexionZohoWorkDrive } from "@/components/ConexionZohoWorkDrive";
import { guardarRetencionAction } from "./actions";

const PROXIMAMENTE = ["Dropbox", "OneDrive", "Google Drive"];

export default async function AlmacenamientoPage() {
  const [empresa, uso, zoho] = await Promise.all([obtenerEmpresa(), obtenerAlmacenamiento(), obtenerEstadoZoho()]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={HardDrive}
        titulo="Almacenamiento"
        descripcion="Cuánto espacio ocupan tus grabaciones, cuánto tiempo se conservan, y a dónde más quieres enviarlas."
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <HardDrive size={16} className="text-indigo-600" />
          Uso actual
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-2xl font-bold text-slate-800">{formatBytes(uso.totalBytes)}</p>
            <p className="text-xs text-slate-500">Espacio usado en grabaciones</p>
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-2xl font-bold text-slate-800">{uso.totalGrabaciones}</p>
            <p className="text-xs text-slate-500">Grabaciones guardadas</p>
          </div>
        </div>
        {uso.porMes.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-500">Últimos meses</p>
            <div className="flex flex-col gap-1">
              {uso.porMes.map((m) => (
                <div key={m.mes} className="flex items-center justify-between text-xs text-slate-500">
                  <span>{m.mes}</span>
                  <span>
                    {m.cantidad} grabación(es) · {formatBytes(m.bytes)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Archive size={16} className="text-indigo-600" />
          Retención y exportación
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

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Cloud size={16} className="text-indigo-600" />
          Sincronizar copias a la nube
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Conecta tu propia cuenta (inicias sesión ahí, nunca nos das tu contraseña) y cada grabación se sube
          automáticamente también a esa carpeta, además de guardarse acá.
        </p>

        <div className="flex flex-col gap-3">
          <ConexionZohoWorkDrive estado={zoho} />

          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Sparkles size={12} />
            Próximamente
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PROXIMAMENTE.map((nombre) => (
              <div
                key={nombre}
                className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center opacity-70"
              >
                <p className="text-xs font-medium text-slate-500">{nombre}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
