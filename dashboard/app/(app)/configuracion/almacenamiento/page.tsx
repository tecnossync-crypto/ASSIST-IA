import { HardDrive, Archive, Download, Cloud, Sparkles } from "lucide-react";
import { obtenerEmpresa, obtenerAlmacenamiento, obtenerEstadoZoho, listarColas } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { FormConFeedback } from "@/components/FormConFeedback";
import { ConexionZohoWorkDrive } from "@/components/ConexionZohoWorkDrive";
import { guardarRetencionAction } from "./actions";

const PROXIMAMENTE = ["Dropbox", "OneDrive", "Google Drive"];
const CAMPO =
  "rounded-md border border-edge bg-surface px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default async function AlmacenamientoPage() {
  const [empresa, uso, zoho, colas] = await Promise.all([
    obtenerEmpresa(),
    obtenerAlmacenamiento(),
    obtenerEstadoZoho(),
    listarColas().catch(() => []),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={HardDrive}
        titulo="Almacenamiento"
        descripcion="Cuánto espacio ocupan tus grabaciones, cuánto tiempo se conservan, y a dónde más quieres enviarlas."
      />

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <HardDrive size={16} className="text-indigo-600" />
          Uso actual
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md bg-surface-2 p-4">
            <p className="text-2xl font-bold text-ink">{formatBytes(uso.totalBytes)}</p>
            <p className="text-xs text-muted">Espacio usado en grabaciones</p>
          </div>
          <div className="rounded-md bg-surface-2 p-4">
            <p className="text-2xl font-bold text-ink">{uso.totalGrabaciones}</p>
            <p className="text-xs text-muted">Grabaciones guardadas</p>
          </div>
        </div>
        {uso.porMes.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted">Últimos meses</p>
            <div className="flex flex-col gap-1">
              {uso.porMes.map((m) => (
                <div key={m.mes} className="flex items-center justify-between text-xs text-muted">
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

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <Archive size={16} className="text-indigo-600" />
          Retención y exportación
        </div>

        <FormConFeedback action={guardarRetencionAction} submitLabel="Guardar" className="mb-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="retencion_dias" className="text-sm font-medium text-ink-2">
              Días que se conservan antes de borrarse
            </label>
            <input
              id="retencion_dias"
              name="retencion_dias"
              type="number"
              min={1}
              defaultValue={empresa.retencion_grabaciones_dias}
              className="w-32 rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-xs text-muted">
              Pasado este tiempo se borra el archivo de audio solo (la transcripción y el resumen de la llamada se
              quedan siempre). Por defecto, 30 días.
            </p>
          </div>
        </FormConFeedback>

        <div className="rounded-md bg-surface-2 p-3">
          <p className="mb-1 text-sm font-medium text-ink-2">Exportar grabaciones</p>
          <p className="mb-3 text-xs text-muted">
            Descarga un .zip con el audio de las llamadas grabadas — sin filtros, exporta todo el historial.
          </p>
          <form
            action="/api/grabaciones/exportar"
            method="get"
            target="_blank"
            className="flex flex-wrap items-end gap-2"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="desde" className="text-[11px] font-medium text-muted">
                Desde
              </label>
              <input id="desde" name="desde" type="date" className={CAMPO} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="hasta" className="text-[11px] font-medium text-muted">
                Hasta
              </label>
              <input id="hasta" name="hasta" type="date" className={CAMPO} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="colaId" className="text-[11px] font-medium text-muted">
                Departamento
              </label>
              <select id="colaId" name="colaId" defaultValue="" className={CAMPO}>
                <option value="">Todos</option>
                {colas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="direccion" className="text-[11px] font-medium text-muted">
                Dirección
              </label>
              <select id="direccion" name="direccion" defaultValue="" className={CAMPO}>
                <option value="">Ambas</option>
                <option value="entrante">Entrantes</option>
                <option value="saliente">Salientes</option>
              </select>
            </div>
            <button
              type="submit"
              className="ts-brand-button flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white shadow shadow-indigo-500/30"
            >
              <Download size={13} />
              Descargar .zip
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Cloud size={16} className="text-indigo-600" />
          Sincronizar copias a la nube
        </div>
        <p className="mb-4 text-xs text-muted">
          Conecta tu propia cuenta (inicias sesión ahí, nunca nos das tu contraseña) y cada grabación se sube
          automáticamente también a esa carpeta, además de guardarse acá.
        </p>

        <div className="flex flex-col gap-3">
          <ConexionZohoWorkDrive estado={zoho} />

          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Sparkles size={12} />
            Próximamente
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PROXIMAMENTE.map((nombre) => (
              <div
                key={nombre}
                className="rounded-lg border border-dashed border-edge bg-surface-2 p-3 text-center opacity-70"
              >
                <p className="text-xs font-medium text-muted">{nombre}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
