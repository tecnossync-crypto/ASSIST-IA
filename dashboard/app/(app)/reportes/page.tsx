import Link from "next/link";
import {
  BarChart3,
  Bot,
  Download,
  Forward,
  Headset,
  MessagesSquare,
  PhoneMissed,
  PhoneCall,
  Smile,
  Timer,
} from "lucide-react";
import { listarCampanas, obtenerReporteIA, type ReporteIA } from "@/lib/api";
import { formatDuracion, formatDuracionLarga } from "@/lib/format";
import { GraficoReporteIA } from "@/components/GraficoReporteIA";
import { BotonImprimir } from "@/components/BotonImprimir";

const ZONA = process.env.REPORTES_TZ ?? "America/Santo_Domingo";

type Preset = "hoy" | "ayer" | "7d" | "30d" | "mes" | "mes_pasado" | "personalizado";

const PRESETS: { valor: Exclude<Preset, "personalizado">; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "ayer", etiqueta: "Ayer" },
  { valor: "7d", etiqueta: "Últimos 7 días" },
  { valor: "30d", etiqueta: "Últimos 30 días" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "mes_pasado", etiqueta: "Mes pasado" },
];

function hoyEnZona(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function rangoDePreset(preset: Exclude<Preset, "personalizado">): { desde: string; hasta: string } {
  const hoy = hoyEnZona();
  switch (preset) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer": {
      const a = sumarDias(hoy, -1);
      return { desde: a, hasta: a };
    }
    case "30d":
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case "mes":
      return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
    case "mes_pasado": {
      const primeroDeEsteMes = `${hoy.slice(0, 8)}01`;
      const ultimoDelPasado = sumarDias(primeroDeEsteMes, -1);
      return { desde: `${ultimoDelPasado.slice(0, 8)}01`, hasta: ultimoDelPasado };
    }
    case "7d":
    default:
      return { desde: sumarDias(hoy, -6), hasta: hoy };
  }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function formatoFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const TIPOS_SOLICITUD: Record<string, string> = {
  cotizacion: "Cotización",
  reclamo: "Reclamo",
  cita: "Cita",
  otro: "Otro",
};

function pct(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}%` : "—";
}

function Tarjeta({
  Icon,
  color,
  titulo,
  valor,
  detalle,
}: {
  Icon: typeof Bot;
  color: string;
  titulo: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-4">
      <span className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon size={16} />
      </span>
      <p className="text-2xl font-semibold tabular-nums text-ink">{valor}</p>
      <p className="text-xs font-medium text-ink-2">{titulo}</p>
      {detalle && <p className="mt-0.5 text-[11px] text-muted">{detalle}</p>}
    </div>
  );
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-xl border border-edge bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
      {descripcion && <p className="mb-3 text-xs text-muted">{descripcion}</p>}
      <div className={descripcion ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function BarraEmbudo({ etiqueta, valor, total, clase }: { etiqueta: string; valor: number; total: number; clase: string }) {
  const ancho = total > 0 ? Math.max(2, Math.round((valor / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-2">{etiqueta}</span>
        <span className="font-medium tabular-nums text-ink">
          {valor} <span className="text-xs font-normal text-muted">({pct(valor, total)})</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${clase}`} style={{ width: `${ancho}%` }} />
      </div>
    </div>
  );
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string; campanaId?: string }>;
}) {
  const sp = await searchParams;
  const personalizado = !!(sp.desde && sp.hasta && FECHA.test(sp.desde) && FECHA.test(sp.hasta));
  const preset: Preset = personalizado
    ? "personalizado"
    : ((PRESETS.some((p) => p.valor === sp.rango) ? sp.rango : "7d") as Preset);
  const { desde, hasta } = personalizado
    ? { desde: sp.desde as string, hasta: sp.hasta as string }
    : rangoDePreset(preset as Exclude<Preset, "personalizado">);
  const campanaId = sp.campanaId || undefined;

  let reporte: ReporteIA | null = null;
  let error = "";
  const [resultado, campanas] = await Promise.all([
    obtenerReporteIA({ desde, hasta, campanaId, tz: ZONA }).catch((e: unknown) => {
      error = e instanceof Error ? e.message : "No se pudo cargar el reporte";
      return null;
    }),
    listarCampanas().catch(() => []),
  ]);
  reporte = resultado;

  const consulta = new URLSearchParams({ desde, hasta, tz: ZONA });
  if (campanaId) consulta.set("campanaId", campanaId);
  const hrefExportar = `/api/reportes/ia/exportar?${consulta.toString()}`;
  const hrefPreset = (valor: string) => {
    const q = new URLSearchParams({ rango: valor });
    if (campanaId) q.set("campanaId", campanaId);
    return `/reportes?${q.toString()}`;
  };
  const nombreCampana = campanas.find((c) => c.id === campanaId)?.nombre;

  const r = reporte?.resumen;
  const sinCalificar = r ? r.total - r.no_contestadas - r.con_conversacion : 0;
  const evaluadas = r ? r.sat_positiva + r.sat_neutral + r.sat_negativa : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BarChart3 size={20} className="text-indigo-600" />
            Reporte de llamadas de IA
          </h1>
          <p className="text-sm text-muted">
            {desde === hasta ? formatoFecha(desde) : `${formatoFecha(desde)} al ${formatoFecha(hasta)}`}
            {nombreCampana ? ` · Campaña: ${nombreCampana}` : " · Todas las llamadas de IA"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a
            href={hrefExportar}
            className="ts-brand-button flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            <Download size={15} />
            Exportar CSV
          </a>
          <BotonImprimir />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 rounded-xl border border-edge bg-surface p-3 print:hidden">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Link
              key={p.valor}
              href={hrefPreset(p.valor)}
              className={
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                (preset === p.valor ? "ts-brand-button text-white shadow shadow-indigo-500/30" : "text-muted hover:bg-surface-2")
              }
            >
              {p.etiqueta}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2" action="/reportes">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
            Desde
            <input
              type="date"
              name="desde"
              defaultValue={desde}
              max={hoyEnZona()}
              className="rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
            Hasta
            <input
              type="date"
              name="hasta"
              defaultValue={hasta}
              max={hoyEnZona()}
              className="rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
            Campaña
            <select
              name="campanaId"
              defaultValue={campanaId ?? ""}
              className="rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Todas</option>
              {campanas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg border border-edge px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2"
          >
            Aplicar
          </button>
        </form>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {reporte && r && (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tarjeta
              Icon={Bot}
              color="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15"
              titulo="Llamadas de IA"
              valor={String(r.total)}
              detalle={`${r.entrantes} entrantes · ${r.salientes} salientes`}
            />
            <Tarjeta
              Icon={MessagesSquare}
              color="bg-sky-50 text-sky-600 dark:bg-sky-500/15"
              titulo="Con conversación"
              valor={String(r.con_conversacion)}
              detalle={`${pct(r.con_conversacion, r.total)} del total`}
            />
            <Tarjeta
              Icon={PhoneMissed}
              color="bg-amber-50 text-amber-600 dark:bg-amber-500/15"
              titulo="No contestadas"
              valor={String(r.no_contestadas)}
              detalle={`${pct(r.no_contestadas, r.total)} del total`}
            />
            <Tarjeta
              Icon={Forward}
              color="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15"
              titulo="Transferidas a asesor"
              valor={String(r.transferidas)}
              detalle={`${pct(r.transferidas, r.con_conversacion)} de las conversaciones`}
            />
            <Tarjeta
              Icon={Timer}
              color="bg-violet-50 text-violet-600 dark:bg-violet-500/15"
              titulo="Duración promedio"
              valor={r.con_conversacion > 0 ? formatDuracion(r.duracion_promedio_segundos) : "—"}
              detalle={`${formatDuracionLarga(r.segundos_totales)} en total`}
            />
            <Tarjeta
              Icon={Smile}
              color="bg-rose-50 text-rose-600 dark:bg-rose-500/15"
              titulo="Clientes contentos"
              valor={pct(r.sat_positiva, evaluadas)}
              detalle={evaluadas > 0 ? `${evaluadas} llamadas evaluadas` : "Sin evaluaciones aún"}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Seccion titulo="Cómo terminaron las llamadas" descripcion="De todas las llamadas de IA del periodo.">
              <div className="flex flex-col gap-3.5">
                <BarraEmbudo etiqueta="Llamadas de IA" valor={r.total} total={r.total} clase="bg-indigo-500" />
                <BarraEmbudo etiqueta="Con conversación" valor={r.con_conversacion} total={r.total} clase="bg-sky-500" />
                <BarraEmbudo etiqueta="Transferidas a un asesor" valor={r.transferidas} total={r.total} clase="bg-emerald-500" />
                <BarraEmbudo etiqueta="Atendidas por un asesor" valor={r.atendidas_por_asesor} total={r.total} clase="bg-teal-500" />
                <BarraEmbudo etiqueta="No contestadas" valor={r.no_contestadas} total={r.total} clase="bg-amber-400" />
              </div>
              {sinCalificar > 0 && (
                <p className="mt-3 text-[11px] text-muted">
                  {sinCalificar} llamada(s) más contestaron pero no llegaron a conversar (el cliente colgó al instante) o siguen en curso.
                </p>
              )}
            </Seccion>

            <Seccion titulo="Las que no se contestaron" descripcion="Por qué no se pudo hablar con el cliente.">
              <ul className="divide-y divide-edge text-sm">
                {[
                  ["Buzón de voz", r.buzon],
                  ["Número inexistente o fuera de servicio", r.numero_inexistente],
                  ["No contestó / ocupado / falló", r.otras_no_contestadas],
                  ["Cerradas por un asesor sin contacto", r.cerradas_sin_contacto],
                ].map(([etiqueta, valor]) => (
                  <li key={String(etiqueta)} className="flex items-center justify-between py-2">
                    <span className="text-ink-2">{etiqueta}</span>
                    <span className="font-medium tabular-nums text-ink">{valor}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
                <Headset size={12} /> Las llamadas que un asesor marca a mano desde el panel no se cuentan aquí.
              </div>
            </Seccion>
          </div>

          <Seccion titulo="Llamadas por día">
            <GraficoReporteIA datos={reporte.por_dia} />
          </Seccion>

          {reporte.por_campana.length > 0 && (
            <Seccion titulo="Por campaña" descripcion="Cómo le fue a cada campaña en el periodo.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Campaña</th>
                      <th className="px-3 py-2 text-right font-semibold">Llamadas</th>
                      <th className="px-3 py-2 text-right font-semibold">Conversaron</th>
                      <th className="px-3 py-2 text-right font-semibold">No contestaron</th>
                      <th className="px-3 py-2 text-right font-semibold">Buzón</th>
                      <th className="py-2 pl-3 text-right font-semibold">Transferidas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {reporte.por_campana.map((c) => (
                      <tr key={c.campana_id}>
                        <td className="py-2 pr-3 font-medium text-ink">
                          <Link href={`/campanas/${c.campana_id}`} className="hover:text-indigo-700 hover:underline">
                            {c.campana_nombre}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.llamadas}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.con_conversacion} <span className="text-xs text-muted">({pct(c.con_conversacion, c.llamadas)})</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.no_contestadas} <span className="text-xs text-muted">({pct(c.no_contestadas, c.llamadas)})</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.buzon}</td>
                        <td className="py-2 pl-3 text-right tabular-nums">{c.transferidas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Seccion>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Seccion titulo="De qué hablan los clientes" descripcion="Motivos más frecuentes que resumió la IA.">
              {reporte.motivos.length === 0 ? (
                <p className="text-sm text-muted">Todavía no hay resúmenes en este periodo.</p>
              ) : (
                <ul className="divide-y divide-edge text-sm">
                  {reporte.motivos.map((m) => (
                    <li key={m.motivo} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate capitalize text-ink-2" title={m.motivo}>
                        {m.motivo}
                      </span>
                      <span className="font-medium tabular-nums text-ink">{m.n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>

            <Seccion titulo="Solicitudes que dejó la IA" descripcion="Cotizaciones, reclamos, citas… registradas durante las llamadas.">
              {reporte.solicitudes.length === 0 ? (
                <p className="text-sm text-muted">No se registraron solicitudes en este periodo.</p>
              ) : (
                <ul className="divide-y divide-edge text-sm">
                  {reporte.solicitudes.map((s) => (
                    <li key={s.tipo} className="flex items-center justify-between py-2">
                      <span className="text-ink-2">{TIPOS_SOLICITUD[s.tipo] ?? s.tipo}</span>
                      <span className="font-medium tabular-nums text-ink">{s.n}</span>
                    </li>
                  ))}
                </ul>
              )}
              {evaluadas > 0 && (
                <div className="mt-4 border-t border-edge pt-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-2">
                    <PhoneCall size={12} /> Ánimo del cliente al terminar
                  </p>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="bg-emerald-500" style={{ width: `${(r.sat_positiva / evaluadas) * 100}%` }} />
                    <div className="bg-slate-400" style={{ width: `${(r.sat_neutral / evaluadas) * 100}%` }} />
                    <div className="bg-red-500" style={{ width: `${(r.sat_negativa / evaluadas) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {r.sat_positiva} contentos · {r.sat_neutral} neutrales · {r.sat_negativa} molestos
                  </p>
                </div>
              )}
            </Seccion>
          </div>

          <p className="text-[11px] text-muted print:mt-2">
            “Llamada de IA” = toda llamada entrante, más las salientes de campañas, API y flujos de trabajo. Horas en la
            zona {reporte.periodo.zona}. Generado el {new Date().toLocaleString("es", { timeZone: ZONA })}.
          </p>
        </>
      )}
    </div>
  );
}
