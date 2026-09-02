import { Building2 } from "lucide-react";
import { obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { guardarEmpresaAction } from "./actions";

export default async function EmpresaConfigPage() {
  const empresa = await obtenerEmpresa();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader Icon={Building2} titulo="Empresa" descripcion="Datos básicos de tu negocio." />

      <form action={guardarEmpresaAction} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5">
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

        <button
          type="submit"
          className="ts-brand-button self-start rounded-md px-5 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
        >
          Guardar
        </button>
      </form>
    </div>
  );
}
