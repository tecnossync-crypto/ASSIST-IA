"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Phone,
  Megaphone,
  Users,
  Settings,
  Radio,
  LogOut,
  X,
  Terminal,
  ChevronDown,
  Building2,
  Bot,
  Workflow,
  Headset,
  Network,
  Plug,
  HardDrive,
  History,
} from "lucide-react";
import { cerrarSesionAction } from "@/app/logout/actions";
import { useMobileNav } from "./MobileNavContext";

const ITEMS = [
  { href: "/", label: "Resumen", Icon: LayoutDashboard },
  { href: "/llamadas", label: "Llamadas", Icon: Phone },
  { href: "/campanas", label: "Campañas", Icon: Megaphone },
  { href: "/contactos", label: "Contactos", Icon: Users },
];

// Solo admin. "Registros API" vive acá (aunque su ruta es /api-logs) para
// que todo lo de administración quede agrupado bajo Configuración.
const ITEMS_CONFIGURACION = [
  { href: "/configuracion/empresa", label: "Empresa", Icon: Building2 },
  { href: "/configuracion/ia", label: "Inteligencia Artificial", Icon: Bot },
  { href: "/configuracion/contactos", label: "Contactos", Icon: Users },
  { href: "/configuracion/flujos", label: "Flujos de trabajo", Icon: Workflow },
  { href: "/configuracion/agentes", label: "Agentes", Icon: Headset },
  { href: "/configuracion/enrutamiento", label: "Enrutamiento", Icon: Network },
  { href: "/configuracion/integraciones", label: "Integraciones", Icon: Plug },
  { href: "/api-logs", label: "Registros API", Icon: Terminal },
  { href: "/configuracion/almacenamiento", label: "Almacenamiento", Icon: HardDrive },
  { href: "/configuracion/auditoria", label: "Auditoría", Icon: History },
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
  const items = (veSupervision ? [...ITEMS.slice(0, 2), ...ITEMS_SUPERVISION, ...ITEMS.slice(2)] : ITEMS).filter(
    (i) => !esOperador || !["/", "/campanas", "/contactos"].includes(i.href)
  );

  // El submenú de Configuración se abre solo cuando se está dentro de
  // alguna de sus pantallas, y se puede abrir/cerrar a mano.
  const dentroDeConfiguracion = pathname.startsWith("/configuracion") || pathname.startsWith("/api-logs");
  const [configAbierto, setConfigAbierto] = useState(dentroDeConfiguracion);
  useEffect(() => {
    if (dentroDeConfiguracion) setConfigAbierto(true);
  }, [dentroDeConfiguracion]);

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
          "fixed inset-y-0 left-0 z-50 flex h-full min-h-0 w-64 flex-shrink-0 flex-col overflow-hidden bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 transition-transform duration-200 ease-out md:static md:z-auto md:w-60 md:translate-x-0 " +
          (abierto ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="flex flex-shrink-0 items-center justify-between px-5 py-5">
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

        {/* min-h-0 + overflow-y-auto: con el submenú de Configuración
            desplegado la lista puede ser más alta que la pantalla; así
            scrollea sola y el usuario/cerrar sesión de abajo no se tapa. */}
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-3 pb-3">
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

          {esAdmin && (
            <div>
              <div
                className={
                  "flex items-center rounded-lg text-sm transition-colors " +
                  (dentroDeConfiguracion ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white")
                }
              >
                <Link
                  href="/configuracion"
                  onClick={() => {
                    setConfigAbierto(true);
                    setAbierto(false);
                  }}
                  className="flex flex-1 items-center gap-3 px-3 py-2"
                >
                  <Settings size={16} strokeWidth={2} />
                  Configuración
                </Link>
                <button
                  type="button"
                  onClick={() => setConfigAbierto((v) => !v)}
                  aria-label={configAbierto ? "Contraer Configuración" : "Desplegar Configuración"}
                  aria-expanded={configAbierto}
                  className="px-3 py-2"
                >
                  <ChevronDown size={15} className={"transition-transform " + (configAbierto ? "rotate-180" : "")} />
                </button>
              </div>

              {configAbierto && (
                <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-2">
                  {ITEMS_CONFIGURACION.map(({ href, label, Icon }) => {
                    const activo = pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setAbierto(false)}
                        className={
                          "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors " +
                          (activo ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white")
                        }
                      >
                        <Icon size={14} strokeWidth={2} />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="mt-auto flex-shrink-0 px-4 py-4">
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
