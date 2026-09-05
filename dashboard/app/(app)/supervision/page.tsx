import { Radio } from "lucide-react";
import { listarLlamadasActivas } from "@/lib/api";
import { TablaSupervision } from "@/components/TablaSupervision";

export default async function SupervisionPage() {
  const llamadas = await listarLlamadasActivas();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Radio size={20} className="text-emerald-600" />
          Supervisión en vivo
        </h1>
        <p className="text-sm text-slate-500">
          Todas las llamadas que están ocurriendo ahora mismo, con qué agente las está atendiendo. Se actualiza sola.
        </p>
      </div>

      <TablaSupervision llamadasIniciales={llamadas} />
    </div>
  );
}
