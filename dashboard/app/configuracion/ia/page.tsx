import { Bot, PhoneCall, Sparkles, MessageSquareText } from "lucide-react";
import { obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { SelectorVoz } from "@/components/SelectorVoz";
import { guardarIaAction } from "./actions";

export default async function IaConfigPage() {
  const empresa = await obtenerEmpresa();
  const g = empresa.guion_agente ?? {};

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Bot}
        titulo="Inteligencia Artificial"
        descripcion="Cómo habla y actúa el agente que contesta tus llamadas."
      />

      <form action={guardarIaAction} className="flex flex-col gap-6">
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

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="tiempo_respuesta_segundos" className="text-sm font-medium text-slate-700">
                  Tiempo de respuesta
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="tiempo_respuesta_segundos"
                    name="tiempo_respuesta_segundos"
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    defaultValue={empresa.tiempo_respuesta_segundos}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-500">seg</span>
                </div>
                <p className="text-xs text-slate-400">Pausa antes de responder (0-5s), para que no suene instantáneo.</p>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="duracion_maxima_minutos" className="text-sm font-medium text-slate-700">
                  Duración máxima
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
                <p className="text-xs text-slate-400">Si se pasa, el bot se despide y corta.</p>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="timeout_timbrado_segundos" className="text-sm font-medium text-slate-700">
                  Timbrado (salientes)
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
                <p className="text-xs text-slate-400">Espera antes de "no contesta".</p>
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
              rows={6}
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
