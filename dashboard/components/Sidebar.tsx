"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
const GRUPOS_CONFIGURACION = [
  {
    titulo: "Negocio",
    items: [
      { href: "/configuracion/empresa", label: "Empresa", Icon: Building2 },
      { href: "/configuracion/ia", label: "Inteligencia Artificial", Icon: Bot },
      { href: "/configuracion/contactos", label: "Campos y diseño", Icon: Users },
      { href: "/configuracion/flujos", label: "Flujos de trabajo", Icon: Workflow },
    ],
  },
  {
    titulo: "Equipo",
    items: [
      { href: "/configuracion/agentes", label: "Agentes", Icon: Headset },
      { href: "/configuracion/enrutamiento", label: "Enrutamiento", Icon: Network },
    ],
  },
  {
    titulo: "Conexiones",
    items: [
      { href: "/configuracion/integraciones", label: "Integraciones", Icon: Plug },
      { href: "/api-logs", label: "Registros API", Icon: Terminal },
    ],
  },
  {
    titulo: "Sistema",
    items: [
      { href: "/configuracion/almacenamiento", label: "Almacenamiento", Icon: HardDrive },
      { href: "/configuracion/auditoria", label: "Auditoría", Icon: History },
    ],
  },
];

// Admin y supervisor — no operador.
const ITEMS_SUPERVISION = [{ href: "/supervision", label: "Supervisión", Icon: Radio }];

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

const CLASE_ITEM_BASE = "relative flex items-center rounded-md transition-colors";
const CLASE_ACTIVO = "bg-white/10 text-white";
const CLASE_INACTIVO = "text-slate-400 hover:bg-white/5 hover:text-white";

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

  // Indicadores de "hay más arriba/abajo" cuando la lista es más alta que la
  // pantalla (degradado discreto en el borde), en vez de que el usuario
  // tenga que adivinar que el menú sigue.
  const navRef = useRef<HTMLElement>(null);
  const [masArriba, setMasArriba] = useState(false);
  const [masAbajo, setMasAbajo] = useState(false);
  const medirScroll = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setMasArriba(el.scrollTop > 4);
    setMasAbajo(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    medirScroll();
    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(medirScroll);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [medirScroll, configAbierto]);

  // Al abrir Configuración o cambiar de pantalla, lleva a la vista la opción
  // activa para no tener que buscarla desplazando el menú a mano.
  useEffect(() => {
    if (!configAbierto) return;
    const t = setTimeout(() => {
      const activo = navRef.current?.querySelector<HTMLElement>("[data-activo='true']");
      activo?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 220);
    return () => clearTimeout(t);
  }, [configAbierto, pathname]);

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
        <div className="flex flex-shrink-0 items-center justify-between px-5 py-4">
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

        {/* La lista scrollea por dentro (min-h-0 + overflow-y-auto) para que
            el usuario y "cerrar sesión" de abajo nunca se tapen; los
            degradados avisan cuando hay más contenido arriba o abajo. */}
        <div className="relative min-h-0 flex-1">
          <nav
            ref={navRef}
            onScroll={medirScroll}
            className="h-full overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-track]:bg-transparent"
          >
            <div className="flex flex-col gap-0.5">
              {items.map(({ href, label, Icon }) => {
                const activo = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setAbierto(false)}
                    className={`${CLASE_ITEM_BASE} gap-3 px-3 py-1.5 text-sm ${activo ? CLASE_ACTIVO : CLASE_INACTIVO}`}
                  >
                    <Icon size={16} strokeWidth={2} />
                    {label}
                  </Link>
                );
              })}

              {esAdmin && (
                <div className="mt-1 border-t border-white/5 pt-1">
                  <div
                    className={`${CLASE_ITEM_BASE} text-sm ${dentroDeConfiguracion ? CLASE_ACTIVO : CLASE_INACTIVO}`}
                  >
                    <Link
                      href="/configuracion"
                      onClick={() => {
                        setConfigAbierto(true);
                        setAbierto(false);
                      }}
                      className="flex flex-1 items-center gap-3 px-3 py-1.5"
                    >
                      <Settings size={16} strokeWidth={2} />
                      Configuración
                    </Link>
                    <button
                      type="button"
                      onClick={() => setConfigAbierto((v) => !v)}
                      aria-label={configAbierto ? "Contraer Configuración" : "Desplegar Configuración"}
                      aria-expanded={configAbierto}
                      className="rounded-md px-3 py-1.5 hover:bg-white/5"
                    >
                      <ChevronDown
                        size={15}
                        className={"transition-transform duration-200 " + (configAbierto ? "rotate-180" : "")}
                      />
                    </button>
                  </div>

                  {/* Despliegue animado: la fila crece de 0 a su alto real
                      (grid-template-rows 0fr -> 1fr), sin saltos. */}
                  <div
                    className={
                      "grid transition-[grid-template-rows] duration-200 ease-out " +
                      (configAbierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
                    }
                    aria-hidden={!configAbierto}
                  >
                    <div className="overflow-hidden">
                      <div className="ml-[18px] mt-1 flex flex-col gap-2 border-l border-white/10 pb-1 pl-2">
                        {GRUPOS_CONFIGURACION.map((grupo) => (
                          <div key={grupo.titulo} className="flex flex-col gap-0.5">
                            <p className="px-3 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              {grupo.titulo}
                            </p>
                            {grupo.items.map(({ href, label, Icon }) => {
                              const activo = pathname.startsWith(href);
                              return (
                                <Link
                                  key={href}
                                  href={href}
                                  tabIndex={configAbierto ? 0 : -1}
                                  data-activo={activo}
                                  onClick={() => setAbierto(false)}
                                  className={`${CLASE_ITEM_BASE} gap-2.5 px-3 py-1 text-[13px] ${activo ? CLASE_ACTIVO : CLASE_INACTIVO}`}
                                >
                                  {activo && (
                                    <span className="absolute -left-[9px] top-1 bottom-1 w-0.5 rounded-full bg-indigo-400" />
                                  )}
                                  <Icon size={14} strokeWidth={2} />
                                  {label}
                                </Link>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </nav>

          <div
            aria-hidden="true"
            className={
              "pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-slate-900 to-transparent transition-opacity " +
              (masArriba ? "opacity-100" : "opacity-0")
            }
          />
          <div
            aria-hidden="true"
            className={
              "pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-900/95 to-transparent transition-opacity " +
              (masAbajo ? "opacity-100" : "opacity-0")
            }
          />
        </div>

        <div className="flex-shrink-0 border-t border-white/10 px-4 py-3">
          {sesion && (
            <div className="flex items-center gap-2.5">
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
                  className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
                >
                  <LogOut size={14} />
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
