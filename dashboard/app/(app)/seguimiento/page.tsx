import Link from "next/link";
import { Search, CalendarClock, MessageSquare, Users, UserCircle2, AlertCircle, Clock, Lightbulb, CheckCircle2, List } from "lucide-react";
import { listarSeguimiento, obtenerConversacion, type ClienteSeguimiento, type ConversacionCliente } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { permisosDe } from "@/lib/permisos";
import { PanelConversacion } from "@/components/PanelConversacion";
import { formatFechaHoraCorta } from "@/lib/format";

type Filtro = "todos" | "vencidos" | "pendientes" | "por_programar" | "hechos";

const FILTROS: { id: Filtro; etiqueta: string; Icon: typeof List }[] = [
  { id: "todos", etiqueta: "Todos", Icon: List },
  { id: "vencidos", etiqueta: "Vencidos", Icon: AlertCircle },
  { id: "pendientes", etiqueta: "Programados", Icon: Clock },
  { id: "por_programar", etiqueta: "Por programar", Icon: Lightbulb },
  { id: "hechos", etiqueta: "Contactados", Icon: CheckCircle2 },
];

const esVencido = (c: ClienteSeguimiento) =>
  c.seguimiento_estado === "pendiente" && c.seguimiento_fecha !== null && new Date(c.seguimiento_fecha).getTime() <= Date.now();

function coincideFiltro(c: ClienteSeguimiento, f: Filtro): boolean {
  if (f === "vencidos") return esVencido(c);
  if (f === "pendientes") return c.seguimiento_estado === "pendiente";
  if (f === "hechos") return c.seguimiento_estado === "hecho";
  if (f === "por_programar") return c.seguimiento_estado !== "pendiente" && Boolean(c.accion_pendiente?.trim());
  return true;
}

const nombreDe = (c: ClienteSeguimiento) => [c.nombre, c.apellido].filter(Boolean).join(" ") || c.numero;

export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; q?: string; vendedor?: string; vista?: string; c?: string }>;
}) {
  const sp = await searchParams;
  const sesion = await obtenerSesion();
  const permisos = permisosDe(sesion);
  const soloPropios = permisos.contactos === "propios";
  const yo = sesion?.usuarioId ?? "";

  const filtro: Filtro = FILTROS.some((f) => f.id === sp.filtro) ? (sp.filtro as Filtro) : "todos";
  // Un vendedor entra directo a "Mis clientes"; un administrador, a "Todos los clientes".
  const vista = sp.vista === "mis" || sp.vista === "todos" ? sp.vista : soloPropios ? "mis" : "todos";
  const vendedor = !soloPropios && vista === "todos" ? sp.vendedor : undefined;
  const q = sp.q?.trim() ?? "";

  const base = await listarSeguimiento({ visiblePara: soloPropios ? yo : undefined }).catch(() => []);

  // Todo lo que se filtra a continuación sale de esta lista (hasta 300 clientes con llamadas).
  const delAlcance = base.filter((c) => {
    if (vista === "mis" && c.propietario_usuario_id !== yo) return false;
    if (vendedor === "ninguno" && c.propietario_usuario_id) return false;
    if (vendedor && vendedor !== "ninguno" && c.propietario_usuario_id !== vendedor) return false;
    return true;
  });
  const lista = delAlcance.filter((c) => {
    if (!coincideFiltro(c, filtro)) return false;
    if (!q) return true;
    const t = `${nombreDe(c)} ${c.numero}`.toLowerCase();
    return t.includes(q.toLowerCase());
  });

  // Asesores con su cantidad de clientes (sobre todo el alcance, sin el filtro de seguimiento).
  const porAsesor = new Map<string, { id: string; nombre: string; total: number; pendientes: number }>();
  let sinPropietario = 0;
  for (const c of base) {
    if (!c.propietario_usuario_id) {
      sinPropietario++;
      continue;
    }
    const a = porAsesor.get(c.propietario_usuario_id) ?? {
      id: c.propietario_usuario_id,
      nombre: c.propietario_nombre ?? "Asesor",
      total: 0,
      pendientes: 0,
    };
    a.total++;
    if (c.seguimiento_estado === "pendiente") a.pendientes++;
    porAsesor.set(c.propietario_usuario_id, a);
  }
  const asesores = [...porAsesor.values()].sort((a, b) => b.total - a.total);
  const misClientes = base.filter((c) => c.propietario_usuario_id === yo).length;

  // Cliente abierto en el panel de conversación (si no es uno de la lista actual, se abre igual si el alcance lo permite).
  let conversacion: ConversacionCliente | null = null;
  if (sp.c) {
    conversacion = await obtenerConversacion(sp.c, soloPropios ? yo : undefined).catch(() => null);
  }

  function href(cambios: { filtro?: Filtro; vendedor?: string | null; vista?: string; c?: string | null }) {
    const p = new URLSearchParams();
    const f = cambios.filtro ?? filtro;
    const v = cambios.vista ?? vista;
    const vend = cambios.vendedor === undefined ? vendedor : cambios.vendedor;
    const cl = cambios.c === undefined ? sp.c : cambios.c;
    if (f !== "todos") p.set("filtro", f);
    if (v !== (soloPropios ? "mis" : "todos")) p.set("vista", v);
    if (vend && v === "todos") p.set("vendedor", vend);
    if (q) p.set("q", q);
    if (cl) p.set("c", cl);
    const s = p.toString();
    return s ? `/seguimiento?${s}` : "/seguimiento";
  }

  const conteoFiltro = (f: Filtro) => delAlcance.filter((c) => coincideFiltro(c, f)).length;
  const ITEM = "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors";
  const ACTIVO = "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300";
  const NORMAL = "text-ink-2 hover:bg-slate-100 dark:hover:bg-white/5";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <CalendarClock size={20} className="text-indigo-600" />
        <div>
          <h1 className="text-xl font-semibold leading-tight">Seguimiento de clientes</h1>
          <p className="text-sm text-muted">
            Qué dijo cada cliente, si pidió que lo vuelvan a llamar y cuándo hacerlo, organizado por asesor.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:h-[calc(100vh-11rem)] lg:min-h-[520px] lg:grid-cols-[230px_minmax(300px,400px)_minmax(0,1fr)]">
        {/* ── Filtros (como el CRM) ── */}
        <aside className="flex flex-col gap-4 overflow-y-auto rounded-xl border border-edge bg-surface p-3">
          <div>
            <h2 className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Vistas</h2>
            <Link href={href({ vista: "mis", vendedor: null, c: null })} className={`${ITEM} ${vista === "mis" ? ACTIVO : NORMAL}`}>
              <span className="flex items-center gap-2">
                <UserCircle2 size={14} />
                Mis clientes
              </span>
              <span className="text-xs text-muted">{misClientes}</span>
            </Link>
            <Link href={href({ vista: "todos", c: null })} className={`${ITEM} ${vista === "todos" && !vendedor ? ACTIVO : NORMAL}`}>
              <span className="flex items-center gap-2">
                <Users size={14} />
                {soloPropios ? "Todos mis contactos" : "Todos los clientes"}
              </span>
              <span className="text-xs text-muted">{base.length}</span>
            </Link>
          </div>

          {!soloPropios && (
            <div>
              <h2 className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Por asesor</h2>
              {asesores.map((a) => (
                <Link
                  key={a.id}
                  href={href({ vista: "todos", vendedor: a.id, c: null })}
                  className={`${ITEM} ${vista === "todos" && vendedor === a.id ? ACTIVO : NORMAL}`}
                >
                  <span className="truncate">{a.nombre}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {a.pendientes > 0 && <span className="rounded-full bg-indigo-100 px-1.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">{a.pendientes}</span>}
                    {a.total}
                  </span>
                </Link>
              ))}
              {sinPropietario > 0 && (
                <Link
                  href={href({ vista: "todos", vendedor: "ninguno", c: null })}
                  className={`${ITEM} ${vista === "todos" && vendedor === "ninguno" ? ACTIVO : NORMAL}`}
                >
                  <span className="italic">Sin propietario</span>
                  <span className="text-xs text-muted">{sinPropietario}</span>
                </Link>
              )}
              {asesores.length === 0 && sinPropietario === 0 && <p className="px-2.5 text-xs text-muted">Aún no hay clientes.</p>}
            </div>
          )}

          <div>
            <h2 className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Seguimiento</h2>
            {FILTROS.map(({ id, etiqueta, Icon }) => (
              <Link key={id} href={href({ filtro: id, c: null })} className={`${ITEM} ${filtro === id ? ACTIVO : NORMAL}`}>
                <span className="flex items-center gap-2">
                  <Icon size={14} />
                  {etiqueta}
                </span>
                <span className={`text-xs ${id === "vencidos" && conteoFiltro(id) > 0 ? "font-semibold text-red-600" : "text-muted"}`}>{conteoFiltro(id)}</span>
              </Link>
            ))}
          </div>
        </aside>

        {/* ── Lista de clientes ── */}
        <section className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-edge bg-surface ${sp.c ? "max-lg:hidden" : ""}`}>
          <form className="border-b border-edge p-2.5">
            {filtro !== "todos" && <input type="hidden" name="filtro" value={filtro} />}
            {vista !== (soloPropios ? "mis" : "todos") && <input type="hidden" name="vista" value={vista} />}
            {vendedor && <input type="hidden" name="vendedor" value={vendedor} />}
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Buscar cliente o número…"
                className="w-full rounded-lg border border-edge bg-surface py-1.5 pl-8 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </form>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {lista.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted">
                {base.length === 0 ? "Todavía no hay clientes con llamadas." : "No hay clientes en esta vista."}
              </p>
            ) : (
              lista.map((c) => {
                const vencido = esVencido(c);
                const activo = sp.c === c.id;
                const necesidad = c.resumen_solicitud || c.resumen_motivo || c.accion_pendiente;
                return (
                  <Link
                    key={c.id}
                    href={href({ c: c.id })}
                    className={
                      "flex gap-2.5 border-b border-edge/70 px-3 py-2.5 transition-colors " +
                      (activo ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-slate-50 dark:hover:bg-white/5")
                    }
                  >
                    <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-semibold text-white">
                      {nombreDe(c).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{nombreDe(c)}</span>
                        <span className="flex-shrink-0 text-[10px] text-muted">{formatFechaHoraCorta(c.ultima_llamada_en)}</span>
                      </div>
                      {necesidad && <p className="truncate text-xs text-ink-2">{necesidad}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {c.seguimiento_estado === "pendiente" && c.seguimiento_fecha && (
                          <span
                            className={
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium " +
                              (vencido
                                ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                                : "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300")
                            }
                          >
                            <CalendarClock size={10} />
                            {formatFechaHoraCorta(c.seguimiento_fecha)}
                            {c.seguimiento_origen === "ia" && " · IA"}
                          </span>
                        )}
                        {c.seguimiento_estado === "hecho" && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Contactado</span>
                        )}
                        {c.seguimiento_estado !== "pendiente" && c.accion_pendiente?.trim() && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Por programar</span>
                        )}
                        {!soloPropios && (
                          <span className="truncate text-[10px] text-muted">{c.propietario_nombre ?? c.propietario_externo ?? "Sin propietario"}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
          <div className="border-t border-edge px-3 py-1.5 text-[11px] text-muted">
            {lista.length} {lista.length === 1 ? "cliente" : "clientes"}
            {base.length >= 300 && " · se muestran los 300 más recientes"}
          </div>
        </section>

        {/* ── Conversación ── */}
        <section className={`min-h-0 overflow-hidden rounded-xl border border-edge bg-surface ${sp.c ? "" : "max-lg:hidden"}`}>
          {sp.c && (
            <Link href={href({ c: null })} className="block border-b border-edge px-4 py-2 text-xs text-indigo-600 hover:underline lg:hidden">
              ← Volver a la lista
            </Link>
          )}
          {conversacion ? (
            <PanelConversacion data={conversacion} />
          ) : (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 px-6 text-center text-muted">
              <MessageSquare size={30} className="opacity-40" />
              <p className="text-sm">
                {sp.c ? "No se pudo abrir esa conversación (no existe o no es de tus clientes)." : "Elige un cliente para ver qué conversó y cuándo volver a contactarlo."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
