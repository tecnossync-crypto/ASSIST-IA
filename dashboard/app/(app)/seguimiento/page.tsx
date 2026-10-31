import Link from "next/link";
import { Search, CalendarClock } from "lucide-react";
import { listarSeguimiento, listarAgentes } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { permisosDe } from "@/lib/permisos";
import { TarjetaSeguimiento } from "@/components/TarjetaSeguimiento";

const FILTROS = [
  { id: "todos", etiqueta: "Todos" },
  { id: "vencidos", etiqueta: "Vencidos" },
  { id: "pendientes", etiqueta: "Programados" },
  { id: "por_programar", etiqueta: "Por programar" },
] as const;

export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; q?: string; vendedor?: string }>;
}) {
  const { filtro: filtroRaw, q, vendedor } = await searchParams;
  const filtro = FILTROS.some((f) => f.id === filtroRaw) ? (filtroRaw as string) : "todos";
  const sesion = await obtenerSesion();
  const permisos = permisosDe(sesion);
  const soloPropios = permisos.contactos === "propios";

  const [clientes, agentes, todos] = await Promise.all([
    listarSeguimiento({
      filtro,
      q,
      visiblePara: soloPropios ? sesion?.usuarioId : undefined,
      propietarioId: !soloPropios ? vendedor : undefined,
    }),
    soloPropios ? Promise.resolve([]) : listarAgentes().catch(() => []),
    // Conteos de las pestañas (sobre todo lo visible, sin el filtro de pestaña).
    listarSeguimiento({
      filtro: "todos",
      visiblePara: soloPropios ? sesion?.usuarioId : undefined,
      propietarioId: !soloPropios ? vendedor : undefined,
    }),
  ]);

  const ahora = Date.now();
  const conteo: Record<string, number> = {
    todos: todos.length,
    vencidos: todos.filter((c) => c.seguimiento_estado === "pendiente" && c.seguimiento_fecha && new Date(c.seguimiento_fecha).getTime() <= ahora).length,
    pendientes: todos.filter((c) => c.seguimiento_estado === "pendiente").length,
    por_programar: todos.filter((c) => c.seguimiento_estado !== "pendiente" && c.accion_pendiente?.trim()).length,
  };

  function href(f: string) {
    const p = new URLSearchParams();
    if (f !== "todos") p.set("filtro", f);
    if (q) p.set("q", q);
    if (vendedor) p.set("vendedor", vendedor);
    const s = p.toString();
    return s ? `/seguimiento?${s}` : "/seguimiento";
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2.5">
          <CalendarClock size={20} className="text-indigo-600" />
          <h1 className="text-xl font-semibold">Seguimiento de clientes</h1>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {soloPropios
            ? "Los clientes a los que se les llamó, qué necesitan y cuándo volver a contactarlos."
            : "Los clientes a los que se les llamó, por vendedor: qué necesitan y cuándo volver a contactarlos."}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-edge bg-surface p-3">
        <form className="flex flex-wrap gap-2">
          {filtro !== "todos" && <input type="hidden" name="filtro" value={filtro} />}
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre o número…"
              className="w-full rounded-lg border border-edge bg-surface py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          {!soloPropios && (
            <select
              name="vendedor"
              defaultValue={vendedor ?? ""}
              className="rounded-lg border border-edge bg-surface px-3 py-2 text-sm"
            >
              <option value="">Todos los vendedores</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            className="ts-brand-button rounded-lg px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            Buscar
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Link
              key={f.id}
              href={href(f.id)}
              className={
                "rounded-full border px-3 py-1 text-xs transition-colors " +
                (filtro === f.id
                  ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                  : "border-edge text-ink-2 hover:border-indigo-300")
              }
            >
              {f.etiqueta} <span className="text-muted">{conteo[f.id]}</span>
            </Link>
          ))}
        </div>
      </div>

      {clientes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-edge py-12 text-center text-sm text-muted">
          {filtro === "todos"
            ? "Todavía no hay clientes con llamadas para dar seguimiento."
            : "No hay clientes en esta vista."}
        </p>
      ) : (
        <div className="grid gap-3">
          {clientes.map((c) => (
            <TarjetaSeguimiento key={c.id} c={c} mostrarVendedor={!soloPropios} />
          ))}
        </div>
      )}
    </div>
  );
}
