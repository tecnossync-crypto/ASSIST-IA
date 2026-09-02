import Link from "next/link";
import { Users, Database, Tags, Upload, ArrowUpRight } from "lucide-react";
import { obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { EditorCamposPersonalizados } from "@/components/EditorCamposPersonalizados";
import { EditorEtiquetas } from "@/components/EditorEtiquetas";
import { guardarContactosConfigAction } from "./actions";

export default async function ContactosConfigPage() {
  const empresa = await obtenerEmpresa();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Users}
        titulo="Contactos"
        descripcion="Qué datos recolecta el agente y cómo se organizan tus clientes."
      />

      <Link
        href="/contactos"
        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-300"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Upload size={16} />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-800">Importar contactos (CSV)</p>
            <p className="text-xs text-slate-500">Se hace desde el módulo de Contactos, no aquí.</p>
          </div>
        </div>
        <ArrowUpRight size={16} className="text-slate-400" />
      </Link>

      <form action={guardarContactosConfigAction} className="flex flex-col gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Database size={16} className="text-indigo-600" />
            Campos a recolectar
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Nombre, apellido y teléfono se guardan siempre. Agrega aquí lo que además necesites por este negocio
            (número de póliza, placa, dirección…). Se guardan en el perfil de cada contacto.
          </p>
          <EditorCamposPersonalizados valorInicial={empresa.campos_personalizados ?? []} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Tags size={16} className="text-indigo-600" />
            Etiquetas de contactos
          </div>
          <EditorEtiquetas valorInicial={empresa.etiquetas_disponibles ?? []} />
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
