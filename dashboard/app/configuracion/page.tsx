import { obtenerEmpresa } from "@/lib/api";
import { guardarConfiguracion } from "./actions";

export default async function ConfiguracionPage() {
  const empresa = await obtenerEmpresa();
  const g = empresa.guion_agente ?? {};

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Configuración del agente</h1>
        <p className="text-sm text-slate-500">
          Así habla y actúa la IA cuando contesta tus llamadas. Guarda para aplicar los cambios en la próxima llamada.
        </p>
      </div>

      <form action={guardarConfiguracion} className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-5">
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

        <hr className="border-slate-100" />

        <div className="flex flex-col gap-1">
          <label htmlFor="prompt_personalizado" className="text-sm font-medium text-slate-700">
            Prompt personalizado (opcional)
          </label>
          <textarea
            id="prompt_personalizado"
            name="prompt_personalizado"
            defaultValue={g.prompt_personalizado}
            rows={5}
            placeholder="Si escribes algo aquí, esto reemplaza por completo los campos guiados de abajo. Ej: 'Eres el asistente de [Empresa]. Saluda con calidez, pregunta el motivo de la llamada...'"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-slate-400">
            Si lo dejas vacío, se usan los campos guiados de abajo para armar el guion automáticamente.
          </p>
        </div>

        <hr className="border-slate-100" />

        <p className="text-sm font-medium text-slate-700">Modo guiado (se ignora si hay prompt personalizado)</p>

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
          <label htmlFor="datos_a_tomar" className="text-sm text-slate-600">
            Datos que debe pedir al cliente
          </label>
          <input
            id="datos_a_tomar"
            name="datos_a_tomar"
            defaultValue={g.datos_a_tomar?.join(", ")}
            placeholder="nombre, telefono, motivo"
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
