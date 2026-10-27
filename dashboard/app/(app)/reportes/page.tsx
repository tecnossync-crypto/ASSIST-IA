import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Forward,
  Headset,
  Layers,
  Megaphone,
  MessagesSquare,
  MousePointerClick,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  Plug,
  Smile,
  Timer,
  Workflow,
  Mic,
} from "lucide-react";
import {
  listarCampanas,
  obtenerLlamadasReporteIA,
  obtenerReporteIA,
  type LlamadaReporte,
  type ReporteIA,
} from "@/lib/api";
import { formatDuracion, formatDuracionLarga } from "@/lib/format";
import { GraficoReporteIA } from "@/components/GraficoReporteIA";
import { BotonImprimir } from "@/components/BotonImprimir";

const ZONA = process.env.REPORTES_TZ ?? "America/Santo_Domingo";
const POR_PAGINA = 25;

type Preset = "hoy" | "ayer" | "7d" | "30d" | "mes" | "mes_pasado" | "personalizado";

const PRESETS: { valor: Exclude<Preset, "personalizado">; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "ayer", etiqueta: "Ayer" },
  { valor: "7d", etiqueta: "Últimos 7 días" },
  { valor: "30d", etiqueta: "Últimos 30 días" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "mes_pasado", etiqueta: "Mes pasado" },
];

// Tipos de reporte: cada pestaña separa un origen de llamadas de IA (la última no es de IA: son llamadas de asesor).
const TIPOS = [
  { valor: "", etiqueta: "Todas", Icon: Layers, ayuda: "Todas las llamadas de IA: entrantes, campañas, API y flujos." },
  { valor: "entrante", etiqueta: "Entrantes", Icon: PhoneIncoming, ayuda: "Clientes que llamaron y contestó la IA." },
  { valor: "campana", etiqueta: "Campañas", Icon: Megaphone, ayuda: "Llamadas salientes de las campañas." },
  { valor: "api", etiqueta: "API", Icon: Plug, ayuda: "Llamadas de IA pedidas por una plataforma externa (CRM, SalesIQ…) por webhook." },
  { valor: "flujo", etiqueta: "Flujos", Icon: Workflow, ayuda: "Llamadas de IA lanzadas por un flujo de trabajo automático." },
  {
    valor: "click_to_call",
    etiqueta: "Click-to-call",
    Icon: MousePointerClick,
    ayuda: "Llamadas de un ASESOR pedidas desde el CRM (no son de IA).",
  },
] as const;

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
    <section className="break-inside-avoid rounded-xl border border-edge bg-surface p-5 print:p-3">
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

const COLOR_RESULTADO: Record<string, string> = {
  Conversación: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  "Transferida a asesor": "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  "Buzón de voz": "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  "Número inexistente": "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  "No contestó / falló": "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  "Cerrada sin contacto": "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  "En curso": "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
};

function FilaLlamada({ l }: { l: LlamadaReporte }) {
  return (
    <tr className="align-middle">
      <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-ink-2">{l.fecha}</td>
      <td className="py-2.5 pr-3">
        <span className="block text-xs font-medium text-ink">{l.tipo_texto}</span>
        {l.detalle && <span className="block max-w-[10rem] truncate text-[11px] text-muted" title={l.detalle}>{l.detalle}</span>}
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-xs text-ink-2">{l.numero_cliente}</td>
      <td className="py-2.5 pr-3">
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${COLOR_RESULTADO[l.resultado] ?? "bg-surface-2 text-ink-2"}`}>
          {l.resultado}
        </span>
        {l.departamento && <span className="mt-0.5 block text-[11px] text-muted">→ {l.departamento}</span>}
        {l.regla === "Sin regla" && (
          <span
            className="mt-0.5 block text-[11px] text-amber-700 dark:text-amber-300"
            title="La solicitud de la API no coincidió con ninguna regla de Configuración → Integraciones: se usó el guion general."
          >
            Sin regla de API
          </span>
        )}
        {l.departamento_recibido && !l.departamento && (
          <span className="mt-0.5 block text-[11px] text-amber-700 dark:text-amber-300" title="El departamento que mandó la API no coincide con ninguno configurado.">
            Depto. «{l.departamento_recibido}» no existe
          </span>
        )}
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3 text-right text-xs tabular-nums text-ink-2">
        {l.duracion_segundos > 0 ? formatDuracion(l.duracion_segundos) : "—"}
      </td>
      <td className="py-2.5 pr-3 text-xs text-ink-2">{l.asesor || <span className="text-muted">—</span>}</td>
      <td className="py-2.5 pr-3">
        {l.grabacion_url ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <>
            <audio controls preload="none" src={l.grabacion_url} className="h-8 w-44 print:hidden" />
            <span className="hidden text-[11px] text-ink-2 print:inline">Con grabación</span>
          </>
        ) : l.falta_grabacion ? (
          <span
            className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300"
            title="La llamada duró lo suficiente para tener grabación, pero no se encontró. Puede que se haya borrado por retención o que Twilio no la entregara."
          >
            <AlertTriangle size={12} /> Sin grabación
          </span>
        ) : (
          <span className="text-[11px] text-muted">—</span>
        )}
      </td>
      <td className="py-2.5 text-right print:hidden">
        <Link href={`/llamadas/${l.id}`} className="text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300">
          Ver
        </Link>
      </td>
    </tr>
  );
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string; campanaId?: string; tipo?: string; pagina?: string }>;
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
  const tipoActual = TIPOS.find((t) => t.valor && t.valor === sp.tipo) ?? TIPOS[0];
  const tipo = tipoActual.valor || undefined;
  const esClick = tipo === "click_to_call";
  const pagina = Math.max(parseInt(sp.pagina ?? "1", 10) || 1, 1);

  let error = "";
  const [reporte, listado, campanas] = await Promise.all([
    obtenerReporteIA({ desde, hasta, campanaId, tipo, tz: ZONA }).catch((e: unknown) => {
      error = e instanceof Error ? e.message : "No se pudo cargar el reporte";
      return null as ReporteIA | null;
    }),
    obtenerLlamadasReporteIA({ desde, hasta, campanaId, tipo, tz: ZONA, pagina, limite: POR_PAGINA }).catch(() => null),
    listarCampanas().catch(() => []),
  ]);

  // Enlaces que conservan el resto de los filtros.
  const enlace = (cambios: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      ...(personalizado ? { desde, hasta } : { rango: preset }),
      campanaId,
      tipo,
      ...cambios,
    };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/reportes?${s}` : "/reportes";
  };

  const consultaCsv = new URLSearchParams({ desde, hasta, tz: ZONA });
  if (campanaId) consultaCsv.set("campanaId", campanaId);
  if (tipo) consultaCsv.set("tipo", tipo);
  const hrefExportar = `/api/reportes/ia/exportar?${consultaCsv.toString()}`;
  const hrefExcel = `/api/reportes/ia/excel?${consultaCsv.toString()}`;
  const nombreCampana = campanas.find((c) => c.id === campanaId)?.nombre;

  const r = reporte?.resumen;
  const sinCalificar = r ? r.total - r.no_contestadas - r.con_conversacion : 0;
  const evaluadas = r ? r.sat_positiva + r.sat_neutral + r.sat_negativa : 0;
  const conteoPorTipo = new Map((reporte?.por_tipo ?? []).map((t) => [t.tipo, t]));
  const totalIA = (reporte?.por_tipo ?? []).filter((t) => t.tipo !== "click_to_call").reduce((a, t) => a + t.llamadas, 0);
  const cuenta = (valor: string) => (valor ? (conteoPorTipo.get(valor)?.llamadas ?? 0) : totalIA);
  const totalPaginas = listado ? Math.max(1, Math.ceil(listado.total / listado.limite)) : 1;

  return (
    <div className="flex flex-col gap-5 print:gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BarChart3 size={20} className="text-indigo-600" />
            Reporte de llamadas de IA
          </h1>
          <p className="text-sm text-muted">
            {desde === hasta ? formatoFecha(desde) : `${formatoFecha(desde)} al ${formatoFecha(hasta)}`}
            {` · ${tipoActual.etiqueta}`}
            {nombreCampana ? ` · Campaña: ${nombreCampana}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a
            href={hrefExcel}
            className="ts-brand-button flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
            title="Libro de Excel con resumen, estadísticas, gráficos y el detalle de cada llamada"
          >
            <FileSpreadsheet size={15} />
            Exportar Excel
          </a>
          <a
            href={hrefExportar}
            className="flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2"
            title="Solo el detalle, en CSV"
          >
            <Download size={15} />
            CSV
          </a>
          <BotonImprimir />
        </div>
      </div>

      {/* Tipos de reporte */}
      <nav aria-label="Tipo de llamadas" className="flex gap-1.5 overflow-x-auto rounded-xl border border-edge bg-surface p-1.5 print:hidden">
        {TIPOS.map((t) => {
          const activo = t.valor === tipoActual.valor;
          return (
            <Link
              key={t.valor || "todas"}
              href={enlace({ tipo: t.valor || undefined, pagina: undefined })}
              title={t.ayuda}
              className={
                "flex flex-shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                (activo ? "ts-brand-button text-white shadow shadow-indigo-500/30" : "text-ink-2 hover:bg-surface-2")
              }
            >
              <t.Icon size={15} />
              {t.etiqueta}
              <span
                className={
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums " +
                  (activo ? "bg-white/20 text-white" : "bg-surface-2 text-muted")
                }
              >
                {cuenta(t.valor)}
              </span>
            </Link>
          );
        })}
      </nav>
      <p className="-mt-3 text-xs text-muted print:hidden">{tipoActual.ayuda}</p>

      {/* Filtros */}
      <div className="flex flex-col gap-3 rounded-xl border border-edge bg-surface p-3 print:hidden">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Link
              key={p.valor}
              href={enlace({ rango: p.valor, desde: undefined, hasta: undefined, pagina: undefined })}
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
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
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
          {esClick ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
              <Tarjeta
                Icon={Headset}
                color="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15"
                titulo="Llamadas de asesor desde el CRM"
                valor={String(r.total)}
              />
              <Tarjeta
                Icon={PhoneMissed}
                color="bg-amber-50 text-amber-600 dark:bg-amber-500/15"
                titulo="No contestadas"
                valor={String(r.no_contestadas)}
                detalle={`${pct(r.no_contestadas, r.total)} del total`}
              />
              <Tarjeta
                Icon={Timer}
                color="bg-violet-50 text-violet-600 dark:bg-violet-500/15"
                titulo="Tiempo hablado"
                valor={formatDuracionLarga(r.segundos_totales)}
              />
              <Tarjeta
                Icon={Mic}
                color="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15"
                titulo="Con grabación"
                valor={String(r.con_grabacion)}
                detalle={`${pct(r.con_grabacion, r.total)} del total`}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6">
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
                Icon={Mic}
                color="bg-rose-50 text-rose-600 dark:bg-rose-500/15"
                titulo="Con grabación"
                valor={String(r.con_grabacion)}
                detalle={`${pct(r.con_grabacion, r.total)} · ${evaluadas > 0 ? `${pct(r.sat_positiva, evaluadas)} contentos` : "sin evaluaciones"}`}
              />
            </div>
          )}

          {!esClick && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 print:grid-cols-2 print:gap-3">
              <Seccion titulo="Cómo terminaron las llamadas" descripcion="De todas las llamadas de este tipo en el periodo.">
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
          )}

          <Seccion titulo="Llamadas por día">
            <GraficoReporteIA datos={reporte.por_dia} />
          </Seccion>

          {!esClick && (reporte.por_regla.length > 0 || reporte.por_departamento.length > 0) && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 print:grid-cols-2 print:gap-3">
              {reporte.por_regla.length > 0 && (
                <Seccion
                  titulo="Regla de API aplicada"
                  descripcion="Qué regla de Configuración → Integraciones usó cada llamada pedida por API."
                >
                  <ul className="divide-y divide-edge text-sm">
                    {reporte.por_regla.map((x) => (
                      <li key={x.regla} className="flex items-center justify-between gap-3 py-2">
                        <span className={x.regla.startsWith("Sin regla") ? "text-amber-700 dark:text-amber-300" : "text-ink-2"}>{x.regla}</span>
                        <span className="font-medium tabular-nums text-ink">{x.llamadas}</span>
                      </li>
                    ))}
                  </ul>
                  {reporte.por_regla.some((x) => x.regla.startsWith("Sin regla")) && (
                    <p className="mt-3 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                      “Sin regla” = la solicitud no traía el campo (etiqueta) que espera alguna regla, así que la IA usó el guion
                      general de la empresa.
                    </p>
                  )}
                </Seccion>
              )}
              {reporte.por_departamento.length > 0 && (
                <Seccion titulo="Departamento al que quedaron" descripcion="Llamadas transferidas o con departamento asignado.">
                  <ul className="divide-y divide-edge text-sm">
                    {reporte.por_departamento.map((x) => (
                      <li key={x.departamento} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-ink-2">{x.departamento}</span>
                        <span className="font-medium tabular-nums text-ink">
                          {x.llamadas} <span className="text-xs font-normal text-muted">({x.transferidas} transf.)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Seccion>
              )}
            </div>
          )}

          {!esClick && reporte.por_campana.length > 0 && (
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

          {!esClick && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 print:grid-cols-2 print:gap-3">
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
          )}

          {/* Llamadas del periodo, con su grabación */}
          <Seccion
            titulo="Llamadas y grabaciones"
            descripcion={
              listado
                ? `${listado.total} llamada(s) de este tipo en el periodo. Reproduce la grabación aquí mismo o abre la llamada para ver la transcripción.`
                : undefined
            }
          >
            {!listado ? (
              <p className="text-sm text-muted">No se pudo cargar el listado de llamadas.</p>
            ) : listado.llamadas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No hay llamadas de este tipo en el periodo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left">
                  <thead className="text-[11px] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Fecha</th>
                      <th className="py-2 pr-3 font-semibold">Tipo</th>
                      <th className="py-2 pr-3 font-semibold">Cliente</th>
                      <th className="py-2 pr-3 font-semibold">Resultado</th>
                      <th className="py-2 pr-3 text-right font-semibold">Duración</th>
                      <th className="py-2 pr-3 font-semibold">Asesor</th>
                      <th className="py-2 pr-3 font-semibold">Grabación</th>
                      <th className="py-2 print:hidden" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {listado.llamadas.map((l) => (
                      <FilaLlamada key={l.id} l={l} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {listado && totalPaginas > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-edge pt-3 text-xs text-muted print:hidden">
                <span>
                  Página {listado.pagina} de {totalPaginas}
                </span>
                <div className="flex gap-2">
                  {listado.pagina > 1 ? (
                    <Link
                      href={enlace({ pagina: String(listado.pagina - 1) })}
                      className="flex items-center gap-1 rounded-lg border border-edge px-2.5 py-1.5 font-medium text-ink-2 hover:bg-surface-2"
                    >
                      <ChevronLeft size={13} /> Anterior
                    </Link>
                  ) : null}
                  {listado.pagina < totalPaginas ? (
                    <Link
                      href={enlace({ pagina: String(listado.pagina + 1) })}
                      className="flex items-center gap-1 rounded-lg border border-edge px-2.5 py-1.5 font-medium text-ink-2 hover:bg-surface-2"
                    >
                      Siguiente <ChevronRight size={13} />
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
          </Seccion>

          <p className="text-[11px] text-muted print:mt-2">
            “Llamada de IA” = entrantes, campañas, llamadas pedidas por API y flujos de trabajo. Click-to-call son llamadas
            de un asesor pedidas desde el CRM. Las llamadas que un asesor marca a mano desde el panel no se cuentan. Horas en
            la zona {reporte.periodo.zona}. Generado el {new Date().toLocaleString("es", { timeZone: ZONA })}.
          </p>
        </>
      )}
    </div>
  );
}
