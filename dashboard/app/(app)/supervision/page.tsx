import { Radio } from "lucide-react";
import { listarLlamadasActivas } from "@/lib/api";
import { TablaSupervision } from "@/components/TablaSupervision";
import { EncabezadoPagina } from "@/components/ui";

export default async function SupervisionPage() {
  const llamadas = await listarLlamadasActivas();

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        Icon={Radio}
        titulo="Supervisión en vivo"
        descripcion="Las llamadas que están ocurriendo ahora mismo y quién las atiende. Se actualiza sola."
        acciones={
          <span className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            En vivo
          </span>
        }
      />

      <TablaSupervision llamadasIniciales={llamadas} />
    </div>
  );
}
