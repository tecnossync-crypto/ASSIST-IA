import Link from "next/link";
import {
  PlayCircle,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneCall,
  Forward,
  Megaphone,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { obtenerResumen, listarLlamadas, obtenerTiempoConectado, type RangoFecha } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { formatFechaHoraCorta, formatDuracion, formatDuracionLarga, etiquetaEstado } from "@/lib/format";
import { GraficoLlamadasSemana } from "@/components/GraficoLlamadasSemana";
import { DonaSatisfaccion } from "@/components/DonaSatisfaccion";

const TARJETAS = [
  { key: "llamadas_hoy", label: "Llamadas", Icon: PhoneCall, color: "text-indigo-600 bg-indigo-50" },
  { key: "entrantes_hoy", label: "Entrantes", Icon: PhoneIncoming, color: "text-sky-600 bg-sky-50" },
  { key: "salientes_hoy", label: "Salientes", Icon: PhoneOutgoing, color: "text-violet-600 bg-violet-50" },
  { key: "llamadas_activas", label: "En curso ahora", Icon: PhoneCall, color: "text-emerald-600 bg-emerald-50" },
  { key: "transferidas_hoy", label: "Transferidas", Icon: Forward, color: "text-amber-600 bg-amber-50" },
  { key: "campanas_activas", label: "Campañas activas", Icon: Megaphone, color: "text-rose-600 bg-rose-50" },
] as const;

const RANGOS: { valor: RangoFecha; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "ayer", etiqueta: "Ayer" },
  { valor: "semana", etiqueta: "Esta semana" },
  { valor: "semana_pasada", etiqueta: "Semana pasada" },
  { valor: "mes", etiqueta: "Este mes" },
];

export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  const { rango: rangoParam } = await searchParams;
  const rango: RangoFecha = (RANGOS.some((r) => r.valor === rangoParam) ? rangoParam : "hoy") as RangoFecha;

  const sesion = await obtenerSesion();
  // Un agente (rol operador) solo ve los números y últimas llamadas de su
  // propia cola.
  const colaId = sesion?.rol === "operador" ? sesion?.colaId : undefined;
  const esOperadorSinCola = sesion?.rol === "operador" && !sesion?.colaId;
  // Tiempo conectado por agente: solo admin/supervisor lo ven — implica
  // asomarse a la actividad de TODO el equipo, no solo la propia.
  const veTiempoConectado = sesion?.rol === "admin" || sesion?.rol === "supervisor";

  const [resumen, ultimas, tiempoConectado] = await Promise.all([
    obtenerResumen(colaId, rango),
    esOperadorSinCola ? Promise.resolve([]) : listarLlamadas({ limite: 6, colaId }),
    veTiempoConectado ? obtenerTiempoConectado(rango).catch(() => []) : Promise.resolve([]),
  ]);

  const totalHoy = Number(resumen.llamadas_hoy);
  const tasaExito = totalHoy > 0 ? Math.round((Number(resumen.completadas_hoy) / totalHoy) * 100) : null;
  const etiquetaRango = RANGOS.find((r) => r.valor === rango)?.etiqueta ?? "Hoy";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Resumen</h1>
          <p className="text-sm text-muted">Estado general de la línea — {etiquetaRango.toLowerCase()}.</p>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-edge bg-surface p-1">
          {RANGOS.map((r) => (
            <Link
              key={r.valor}
              href={r.valor === "hoy" ? "/" : `/?rango=${r.valor}`}
              className={
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                (rango === r.valor ? "ts-brand-button text-white shadow shadow-indigo-500/30" : "text-muted hover:bg-surface-2")
              }
            >
              {r.etiqueta}
            </Link>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {TARJETAS.map((t) => (
          <div key={t.key} className="rounded-xl border border-edge bg-surface p-4">
            <span className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${t.color}`}>
              <t.Icon size={16} />
            </span>
            <p className="text-2xl font-bold text-ink">{resumen[t.key]}</p>
            <p className="text-xs text-muted">{t.label}</p>
          </div>
        ))}
      </div>

      {/* Fila de gráficos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-edge bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-2">Llamadas · últimos 7 días</h2>
            {tasaExito !== null && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 size={13} />
                {tasaExito}% completadas — {etiquetaRango.toLowerCase()}
              </span>
            )}
          </div>
          <GraficoLlamadasSemana datos={resumen.llamadas_por_dia} />
        </section>

        <section className="rounded-xl border border-edge bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink-2">Satisfacción del cliente</h2>
          <DonaSatisfaccion datos={resumen.satisfaccion} />
        </section>
      </div>

      {/* Tiempo conectado por agente (solo admin/supervisor) */}
      {veTiempoConectado && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-2">Tiempo conectado por agente — {etiquetaRango.toLowerCase()}</h2>
          <div className="overflow-hidden rounded-lg border border-edge bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Agente</th>
                  <th className="px-4 py-2 font-medium">Estado ahora</th>
                  <th className="px-4 py-2 font-medium">Tiempo conectado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {tiempoConectado.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-2">
                    <td className="px-4 py-3 text-ink">{a.nombre}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs">
                        <Circle
                          size={8}
                          className={a.conectado_ahora ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300"}
                        />
                        {a.conectado_ahora ? "Conectado" : "Desconectado"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink-2">
                      {formatDuracionLarga(Number(a.segundos_conectado))}
                    </td>
                  </tr>
                ))}
                {tiempoConectado.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted">
                      Sin datos de conexión todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Últimas llamadas */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-2">Últimas llamadas</h2>
        <Link href="/llamadas" className="text-sm text-indigo-700 hover:underline">
          Ver todas →
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-edge bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Fecha</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Número</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Duración</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Motivo</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {ultimas.map((l) => (
                <tr key={l.id} className="hover:bg-surface-2">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/llamadas/${l.id}`}>{formatFechaHoraCorta(l.iniciada_en)}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {l.direccion === "entrante" ? l.numero_origen : l.numero_destino}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDuracion(l.duracion_segundos)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{etiquetaEstado(l.estado)}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-ink-2">{l.resumen_motivo ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      href={`/llamadas/${l.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      <PlayCircle size={13} />
                      Grabación
                    </Link>
                  </td>
                </tr>
              ))}
              {ultimas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No hay llamadas todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
