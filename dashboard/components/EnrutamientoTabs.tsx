import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface PestanaEnrutamiento {
  id: string;
  etiqueta: string;
  Icon: LucideIcon;
}

// Pestañas por URL (?seccion=...): se pueden compartir y el botón "atrás" funciona.
export function EnrutamientoTabs({ pestanas, activa }: { pestanas: PestanaEnrutamiento[]; activa: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-edge" aria-label="Secciones de enrutamiento">
      {pestanas.map(({ id, etiqueta, Icon }) => {
        const esActiva = id === activa;
        return (
          <Link
            key={id}
            href={`/configuracion/enrutamiento?seccion=${id}`}
            scroll={false}
            aria-current={esActiva ? "page" : undefined}
            className={
              "-mb-px flex flex-shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors " +
              (esActiva
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-300"
                : "border-transparent text-muted hover:border-edge hover:text-ink")
            }
          >
            <Icon size={15} />
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
