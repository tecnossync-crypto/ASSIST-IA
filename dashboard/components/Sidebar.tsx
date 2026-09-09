"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Phone, Megaphone, Users, Settings, Radio, LogOut, X } from "lucide-react";
import { cerrarSesionAction } from "@/app/logout/actions";
import { useMobileNav } from "./MobileNavContext";

const ITEMS = [
  { href: "/", label: "Resumen", Icon: LayoutDashboard },
  { href: "/llamadas", label: "Llamadas", Icon: Phone },
  { href: "/campanas", label: "Campañas", Icon: Megaphone },
  { href: "/contactos", label: "Contactos", Icon: Users },
  { href: "/configuracion", label: "Configuración", Icon: Settings },
];

// Admin y supervisor — no operador.
const ITEMS_SUPERVISION = [{ href: "/supervision", label: "Supervisión", Icon: Radio }];

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Sidebar({ sesion }: { sesion: { nombre: string; rol: string } | null }) {
  const pathname = usePathname();
  const { abierto, setAbierto } = useMobileNav();
  const esAdmin = sesion?.rol === "admin";
  const esOperador = sesion?.rol === "operador";
  const veSupervision = sesion?.rol === "admin" || sesion?.rol === "supervisor";
  // Un operador solo ve su propia cola de llamadas (Resumen, Campañas y
  // Contactos son vista/gestión de cartera, no operación diaria de un
  // agente individual — el middleware ya bloquea estas rutas por URL
  // directa, esto es solo para no mostrarle un link a algo que no puede
  // abrir).
  const items = (
    veSupervision ? [...ITEMS.slice(0, 2), ...ITEMS_SUPERVISION, ...ITEMS.slice(2)] : ITEMS
  )
    .filter((i) => i.href !== "/configuracion" || esAdmin)
    .filter((i) => !esOperador || !["/", "/campanas", "/contactos"].includes(i.href));

  return (
    <>
      {/* Fondo oscuro detrás del panel cuando está abierto en celular/tablet
          vertical — tocarlo cierra el menú, igual que un modal. En md+ el
          Sidebar ya es fijo/estático y esto nunca se muestra. */}
      {abierto && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setAbierto(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={
          "fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-shrink-0 flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 transition-transform duration-200 ease-out md:static md:z-auto md:w-60 md:translate-x-0 " +
          (abierto ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setAbierto(false)}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black text-white shadow shadow-indigo-500/30">
              V
            </span>
            <span className="text-base font-black tracking-tight text-white">
              Tecnossync
              <span className="block text-xs font-medium text-slate-400">Voz IA</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar menú"
            className="text-slate-400 hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {items.map(({ href, label, Icon }) => {
            const activo = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setAbierto(false)}
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

        <div className="mt-auto px-4 py-4">
          {sesion && (
            <div className="mb-3 flex items-center gap-2.5 border-t border-white/10 pt-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                {iniciales(sesion.nombre)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white">{sesion.nombre}</p>
                <p className="text-[11px] capitalize text-slate-400">{sesion.rol}</p>
              </div>
              <form action={cerrarSesionAction}>
                <button
                  type="submit"
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                  className="text-slate-400 hover:text-white"
                >
                  <LogOut size={14} />
                </button>
              </form>
            </div>
          )}
          <p className="px-1 text-xs text-slate-500">Plataforma de Voz IA</p>
        </div>
      </aside>
    </>
  );
}
