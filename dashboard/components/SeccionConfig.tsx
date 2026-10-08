import type { LucideIcon } from "lucide-react";

// Tarjeta uniforme de una sección de configuración: icono, título, explicación
// corta y el contenido. Se usa para que todas las pantallas se vean igual.
export function SeccionConfig({
  Icon,
  titulo,
  descripcion,
  children,
}: {
  Icon: LucideIcon;
  titulo: string;
  descripcion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-edge bg-surface shadow-sm">
      <header className="flex items-start gap-3 border-b border-edge px-5 py-4">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-xs leading-relaxed text-muted">{descripcion}</p>}
        </div>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
