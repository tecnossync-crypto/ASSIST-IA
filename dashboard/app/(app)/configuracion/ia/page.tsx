import { Bot, PhoneCall, Terminal, MessageSquareText } from "lucide-react";
import { obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { SelectorVoz } from "@/components/SelectorVoz";
import { FormConFeedback } from "@/components/FormConFeedback";
import { ProbarLlamadaIA } from "@/components/ProbarLlamadaIA";
import { ClonarVoz } from "@/components/ClonarVoz";
import { guardarIaAction } from "./actions";

export default async function IaConfigPage() {
  const empresa = await obtenerEmpresa();
  const g = empresa.guion_agente ?? {};

  return (
    <div className="flex flex-col gap-6">
      <ConfiguracionHeader
        Icon={Bot}
        titulo="Inteligencia Artificial"
        descripcion="Cómo habla y actúa el agente que contesta tus llamadas."
      />

      <FormConFeedback action={guardarIaAction} className="flex flex-col gap-6">
        {/* Panel de selección — gestor de llamadas, franja horizontal arriba de todo */}
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <PhoneCall size={16} className="text-indigo-600" />
            Gestor de llamadas
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Voz del agente</span>
              <SelectorVoz defaultValue={empresa.voz_agente} defaultProvider={empresa.tts_provider} />
            </div>

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
              <p className="text-xs text-slate-400">Pausa antes de responder (0-5s).</p>
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
              <p className="text-xs text-slate-400">El bot se despide y corta al llegar aquí.</p>
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
        </section>

        {/* Consola de prompt (principal) + modo guiado (barra lateral) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-lg lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
              <span className="ml-2 flex items-center gap-1.5 text-xs text-slate-400">
                <Terminal size={12} />
                prompt.system
              </span>
            </div>
            <textarea
              id="prompt_personalizado"
              name="prompt_personalizado"
              defaultValue={g.prompt_personalizado}
              placeholder={
                "Si escribes algo aquí, esto reemplaza por completo los campos guiados de al lado.\n\n" +
                "Ej:\nEres el asistente de [Empresa]. Saluda con calidez, pregunta el motivo de la\n" +
                "llamada, toma nombre y teléfono, y transfiere si el cliente lo pide o está molesto."
              }
              spellCheck={false}
              className="h-[420px] w-full resize-none bg-slate-950 px-4 py-4 font-mono text-sm text-slate-100 caret-indigo-400 placeholder:text-slate-600 focus:outline-none lg:h-[520px]"
            />
            <div className="border-t border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-500">
              Si lo dejas vacío, se usa el modo guiado de la derecha para armar el prompt automáticamente.
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <MessageSquareText size={16} className="text-indigo-600" />
              Modo guiado
            </div>
            <p className="mb-4 text-xs text-slate-400">Se ignora si escribiste algo en la consola de la izquierda.</p>
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
                  placeholder="Ej: agendar citas, cotizaciones"
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
                  placeholder="Ej: si lo pide o está molesto"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </section>
        </div>
      </FormConFeedback>

      <ClonarVoz />
      <ProbarLlamadaIA />
    </div>
  );
}
