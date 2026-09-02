import { Building2, MessageSquareText, Sparkles, PhoneCall } from "lucide-react";
import { obtenerEmpresa } from "@/lib/api";
import { guardarConfiguracion } from "./actions";
import { SelectorVoz } from "@/components/SelectorVoz";
import { ConfiguracionTabs } from "@/components/ConfiguracionTabs";

export default async function ConfiguracionPage() {
  const empresa = await obtenerEmpresa();
  const g = empresa.guion_agente ?? {};

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-slate-500">
          Así habla y actúa la IA cuando contesta tus llamadas. Guarda para aplicar los cambios en la próxima llamada.
        </p>
      </div>

      <ConfiguracionTabs activo="/configuracion" />

      <form action={guardarConfiguracion} className="flex flex-col gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Building2 size={16} className="text-indigo-600" />
            Datos de la empresa
          </div>
          <div className="flex flex-col gap-4">
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
          </div>
        </section>

        <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <PhoneCall size={16} className="text-indigo-600" />
            Gestor de llamadas
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Voz del agente</span>
              <SelectorVoz defaultValue={empresa.voz_agente} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="duracion_maxima_minutos" className="text-sm font-medium text-slate-700">
                  Duración máxima por llamada
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="duracion_maxima_minutos"
                    name="duracion_maxima_minutos"
                    type="number"
                    min={1}
                    step={0.5}
                    defaultValue={(empresa.duracion_maxima_llamada_segundos / 60).toString()}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-500">min</span>
                </div>
                <p className="text-xs text-slate-400">Si se pasa, el bot se despide y corta la llamada.</p>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="timeout_timbrado_segundos" className="text-sm font-medium text-slate-700">
                  Tiempo de timbrado (salientes)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="timeout_timbrado_segundos"
                    name="timeout_timbrado_segundos"
                    type="number"
                    min={5}
                    max={600}
                    defaultValue={empresa.timeout_timbrado_segundos}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-500">seg</span>
                </div>
                <p className="text-xs text-slate-400">Cuánto espera antes de dar la llamada por "no contesta".</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Sparkles size={16} className="text-indigo-600" />
            Prompt personalizado
          </div>
          <div className="flex flex-col gap-1">
            <textarea
              id="prompt_personalizado"
              name="prompt_personalizado"
              defaultValue={g.prompt_personalizado}
              rows={5}
              placeholder="Si escribes algo aquí, esto reemplaza por completo los campos guiados de abajo. Ej: 'Eres el asistente de [Empresa]. Saluda con calidez, pregunta el motivo de la llamada...'"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-400">
              Si lo dejas vacío, se usan los campos guiados de abajo para armar el guion automáticamente.
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <MessageSquareText size={16} className="text-indigo-600" />
            Modo guiado <span className="font-normal text-slate-400">(se ignora si hay prompt personalizado)</span>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="saludo" className="text-sm text-slate-600">
                Saludo inicial
              </label>
              <input
                id="saludo"
                name="saludo"
                defaultValue={g.saludo}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="que_resuelve" className="text-sm text-slate-600">
                Qué resuelve esta línea
              </label>
              <input
                id="que_resuelve"
                name="que_resuelve"
                defaultValue={g.que_resuelve}
                placeholder="Ej: agendar citas, cotizaciones, soporte técnico"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="cuando_transferir" className="text-sm text-slate-600">
                Cuándo transferir a un humano
              </label>
              <input
                id="cuando_transferir"
                name="cuando_transferir"
                defaultValue={g.cuando_transferir}
                placeholder="Ej: si el cliente lo pide o está molesto"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </section>

        <button
          type="submit"
          className="ts-brand-button self-start rounded-md px-5 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 transition-colors"
        >
          Guardar
        </button>
      </form>
    </div>
  );
}
