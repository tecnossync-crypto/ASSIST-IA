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
      <Link href="/configuracion" className="text-sm text-muted hover:underline">
        ← Configuración
      </Link>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Icon size={18} />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
          <p className="text-sm text-muted">{descripcion}</p>
        </div>
      </div>
    </div>
  );
}
