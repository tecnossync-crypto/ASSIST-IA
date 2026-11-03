import { Bot, PhoneCall, MessageSquareText, ScrollText, Wrench, Forward, ClipboardList, Database, PhoneOff } from "lucide-react";
import { obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { SeccionConfig } from "@/components/SeccionConfig";
import { SelectorVoz } from "@/components/SelectorVoz";
import { FormConFeedback } from "@/components/FormConFeedback";
import { ProbarLlamadaIA } from "@/components/ProbarLlamadaIA";
import { ClonarVoz } from "@/components/ClonarVoz";
import { EditorPromptConVariables } from "@/components/EditorPromptConVariables";
import { guardarIaAction } from "./actions";

const CAMPO =
  "w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

/** Campo numérico con su unidad y una nota corta debajo. */
function CampoNumero({
  id,
  etiqueta,
  unidad,
  nota,
  ...props
}: {
  id: string;
  etiqueta: string;
  unidad: string;
  nota: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-2">
        {etiqueta}
      </label>
      <div className="flex items-center gap-2">
        <input id={id} name={id} type="number" className={CAMPO} {...props} />
        <span className="w-8 text-sm text-muted">{unidad}</span>
      </div>
      <p className="text-xs leading-relaxed text-muted">{nota}</p>
    </div>
  );
}

const HERRAMIENTAS = [
  {
    Icon: Forward,
    nombre: "transferir_a_humano",
    cuando: "Pasa la llamada en vivo a un asesor: lo pide el cliente, está molesto o el caso se sale del guion.",
  },
  {
    Icon: ClipboardList,
    nombre: "registrar_solicitud",
    cuando: "Guarda lo que pidió el cliente (cotización, pago, reclamo…) para que un gestor lo retome después.",
  },
  {
    Icon: Database,
    nombre: "registrar_dato",
    cuando: "Guarda un dato que la empresa quiere recolectar (nombre, póliza, placa…) en cuanto el cliente lo dice.",
  },
  {
    Icon: PhoneOff,
    nombre: "terminar_llamada",
    cuando: "Cuelga después de despedirse: el cliente no necesita nada más, no le interesa o contestó un buzón.",
  },
];

export default async function IaConfigPage() {
  const empresa = await obtenerEmpresa();
  const g = empresa.guion_agente ?? {};

  return (
    <div className="flex flex-col gap-6">
      <ConfiguracionHeader
        Icon={Bot}
        titulo="Inteligencia Artificial"
        descripcion="Cómo habla y actúa el agente que contesta y realiza tus llamadas."
      />

      <FormConFeedback action={guardarIaAction} className="flex flex-col gap-6">
        <SeccionConfig
          Icon={PhoneCall}
          titulo="Gestor de llamadas"
          descripcion="La voz del agente y los tiempos de cada llamada."
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Voz del agente</span>
              <SelectorVoz
                key={`${empresa.voz_agente ?? ""}::${empresa.tts_provider ?? ""}`}
                defaultValue={empresa.voz_agente}
                defaultProvider={empresa.tts_provider}
              />
              <p className="text-xs leading-relaxed text-muted">Con la que habla en todas las llamadas.</p>
            </div>

            <CampoNumero
              id="tiempo_respuesta_segundos"
              etiqueta="Tiempo de respuesta"
              unidad="seg"
              nota="Pausa antes de responder, para que no suene apresurado (0 a 5 s)."
              min={0}
              max={5}
              step={0.5}
              defaultValue={empresa.tiempo_respuesta_segundos}
            />

            <CampoNumero
              id="duracion_maxima_minutos"
              etiqueta="Duración máxima"
              unidad="min"
              nota="Al llegar a este tiempo el bot se despide y corta la llamada."
              min={1}
              step={0.5}
              defaultValue={(empresa.duracion_maxima_llamada_segundos / 60).toString()}
            />

            <CampoNumero
              id="timeout_timbrado_segundos"
              etiqueta="Timbrado en salientes"
              unidad="seg"
              nota="Cuánto espera que contesten antes de dar la llamada por «no contesta»."
              min={5}
              max={600}
              defaultValue={empresa.timeout_timbrado_segundos}
            />
          </div>
        </SeccionConfig>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="flex flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-sm lg:col-span-2">
            <header className="flex items-start gap-3 border-b border-edge px-5 py-4">
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                <ScrollText size={16} />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink">Instrucciones del agente (prompt)</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  Escribe con tus palabras quién es el agente, qué debe lograr y cuándo transferir. Si escribes algo aquí,
                  reemplaza el modo guiado.
                </p>
              </div>
            </header>
            <div className="bg-slate-950">
              <EditorPromptConVariables
                defaultValue={g.prompt_personalizado}
                campos={empresa.campos_personalizados ?? []}
                placeholder={
                  "Ej:\nEres el asistente de [Empresa]. Saluda con calidez, pregunta el motivo de la\n" +
                  "llamada, toma nombre y teléfono, y transfiere si el cliente lo pide o está molesto.\n\n" +
                  'Escribe "/" para insertar variables del contacto, ej: {{nombre}}, {{numero_de_poliza}}...'
                }
              />
            </div>
            <footer className="border-t border-edge bg-surface-2 px-5 py-2.5 text-xs leading-relaxed text-muted">
              Si lo dejas vacío se arma solo con el modo guiado. Escribe <span className="font-mono text-ink-2">/</span> para
              insertar variables del contacto: se reemplazan por sus datos reales cuando ya lo conocemos.
            </footer>
          </section>

          <SeccionConfig
            Icon={MessageSquareText}
            titulo="Modo guiado"
            descripcion="Lo más simple: llena tres datos y el prompt se arma solo. Se ignora si escribiste instrucciones a la izquierda."
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="saludo" className="text-sm font-medium text-ink-2">
                  Saludo inicial
                </label>
                <input id="saludo" name="saludo" defaultValue={g.saludo} className={CAMPO} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="que_resuelve" className="text-sm font-medium text-ink-2">
                  Qué resuelve esta línea
                </label>
                <input
                  id="que_resuelve"
                  name="que_resuelve"
                  defaultValue={g.que_resuelve}
                  placeholder="Ej: agendar citas, cotizaciones"
                  className={CAMPO}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="cuando_transferir" className="text-sm font-medium text-ink-2">
                  Cuándo transferir a un humano
                </label>
                <input
                  id="cuando_transferir"
                  name="cuando_transferir"
                  defaultValue={g.cuando_transferir}
                  placeholder="Ej: si lo pide o está molesto"
                  className={CAMPO}
                />
              </div>
            </div>
          </SeccionConfig>
        </div>
      </FormConFeedback>

      <SeccionConfig
        Icon={Wrench}
        titulo="Acciones que el agente puede hacer"
        descripcion="Puedes mencionarlas por su nombre en tus instrucciones (por ejemplo: «cuando el cliente se despida, usa terminar_llamada»)."
      >
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {HERRAMIENTAS.map(({ Icon, nombre, cuando }) => (
            <li key={nombre} className="flex items-start gap-3 rounded-lg bg-surface-2 p-3 ring-1 ring-edge">
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-indigo-600 ring-1 ring-edge dark:text-indigo-300">
                <Icon size={15} />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[13px] font-semibold text-ink">{nombre}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{cuando}</p>
              </div>
            </li>
          ))}
        </ul>
      </SeccionConfig>

      <ClonarVoz />
      <ProbarLlamadaIA />
    </div>
  );
}
