"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Phone, Megaphone, Users, Settings } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Resumen", Icon: LayoutDashboard },
  { href: "/llamadas", label: "Llamadas", Icon: Phone },
  { href: "/campanas", label: "Campañas", Icon: Megaphone },
  { href: "/contactos", label: "Contactos", Icon: Users },
  { href: "/configuracion", label: "Configuración", Icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-shrink-0 flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950">
      <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black text-white shadow shadow-indigo-500/30">
          V
        </span>
        <span className="text-base font-black tracking-tight text-white">
          Tecnossync
          <span className="block text-xs font-medium text-slate-400">Voz IA</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5 px-3">
        {ITEMS.map(({ href, label, Icon }) => {
          const activo = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                (activo ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white")
              }
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-5 py-4 text-xs text-slate-500">Plataforma de Voz IA</div>
    </aside>
  );
}
