import { Building2 } from "lucide-react";
import { obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { FormConFeedback } from "@/components/FormConFeedback";
import { guardarEmpresaAction } from "./actions";

export default async function EmpresaConfigPage() {
  const empresa = await obtenerEmpresa();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader Icon={Building2} titulo="Empresa" descripcion="Datos básicos de tu negocio." />

      <FormConFeedback
        action={guardarEmpresaAction}
        className="flex flex-col gap-4 rounded-lg border border-edge bg-surface p-5"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="nombre" className="text-sm font-medium text-ink-2">
            Nombre de la empresa
          </label>
          <input
            id="nombre"
            name="nombre"
            defaultValue={empresa.nombre}
            required
            className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </FormConFeedback>
    </div>
  );
}
