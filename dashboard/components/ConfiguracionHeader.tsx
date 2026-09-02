import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function ConfiguracionHeader({
  Icon,
  titulo,
  descripcion,
}: {
  Icon: LucideIcon;
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Link href="/configuracion" className="text-sm text-slate-500 hover:underline">
        ← Configuración
      </Link>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow shadow-indigo-500/30">
          <Icon size={18} />
        </span>
        <div>
          <h1 className="text-xl font-semibold">{titulo}</h1>
          <p className="text-sm text-slate-500">{descripcion}</p>
        </div>
      </div>
    </div>
  );
}
