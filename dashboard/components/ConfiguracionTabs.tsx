import Link from "next/link";
import { Building2, Database, Workflow } from "lucide-react";

const TABS = [
  { href: "/configuracion", label: "General", Icon: Building2 },
  { href: "/configuracion/campos", label: "Campos y etiquetas", Icon: Database },
  { href: "/configuracion/flujos", label: "Flujos de trabajo", Icon: Workflow },
];

export function ConfiguracionTabs({ activo }: { activo: string }) {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {TABS.map(({ href, label, Icon }) => {
        const esActivo = href === activo;
        return (
          <Link
            key={href}
            href={href}
            className={
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
              (esActivo
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800")
            }
          >
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
