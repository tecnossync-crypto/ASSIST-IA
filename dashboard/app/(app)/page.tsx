import Link from "next/link";
import { PlayCircle, PhoneIncoming, PhoneOutgoing, PhoneCall, Forward, Megaphone, CheckCircle2 } from "lucide-react";
import { obtenerResumen, listarLlamadas } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { formatFechaHoraCorta, formatDuracion, etiquetaEstado } from "@/lib/format";
import { GraficoLlamadasSemana } from "@/components/GraficoLlamadasSemana";
import { DonaSatisfaccion } from "@/components/DonaSatisfaccion";

const TARJETAS = [
  { key: "llamadas_hoy", label: "Llamadas hoy", Icon: PhoneCall, color: "text-indigo-600 bg-indigo-50" },
  { key: "entrantes_hoy", label: "Entrantes hoy", Icon: PhoneIncoming, color: "text-sky-600 bg-sky-50" },
  { key: "salientes_hoy", label: "Salientes hoy", Icon: PhoneOutgoing, color: "text-violet-600 bg-violet-50" },
  { key: "llamadas_activas", label: "En curso ahora", Icon: PhoneCall, color: "text-emerald-600 bg-emerald-50" },
  { key: "transferidas_hoy", label: "Transferidas hoy", Icon: Forward, color: "text-amber-600 bg-amber-50" },
  { key: "campanas_activas", label: "Campañas activas", Icon: Megaphone, color: "text-rose-600 bg-rose-50" },
] as const;

export default async function ResumenPage() {
  const sesion = await obtenerSesion();
  // Un agente (rol operador) solo ve los números y últimas llamadas de su
  // propia cola.
  const colaId = sesion?.rol === "operador" ? sesion?.colaId : undefined;
  const esOperadorSinCola = sesion?.rol === "operador" && !sesion?.colaId;

  const [resumen, ultimas] = await Promise.all([
    obtenerResumen(colaId),
    esOperadorSinCola ? Promise.resolve([]) : listarLlamadas({ limite: 6, colaId }),
  ]);

  const totalHoy = Number(resumen.llamadas_hoy);
  const tasaExito = totalHoy > 0 ? Math.round((Number(resumen.completadas_hoy) / totalHoy) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Resumen</h1>
        <p className="text-sm text-muted">Estado general de la línea, hoy.</p>
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
                {tasaExito}% completadas hoy
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
