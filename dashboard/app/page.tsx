import Link from "next/link";
import { obtenerResumen, listarLlamadas } from "@/lib/api";
import { formatFechaHora, formatDuracion, etiquetaEstado } from "@/lib/format";

const TARJETAS = [
  { key: "llamadas_hoy", label: "Llamadas hoy" },
  { key: "llamadas_activas", label: "En curso ahora" },
  { key: "transferidas_hoy", label: "Transferidas hoy" },
  { key: "campanas_activas", label: "Campañas activas" },
] as const;

export default async function ResumenPage() {
  const [resumen, ultimas] = await Promise.all([
    obtenerResumen(),
    listarLlamadas({ limite: 5 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Resumen</h1>
        <p className="text-sm text-slate-500">Estado general de la línea, hoy.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {TARJETAS.map((t) => (
          <div key={t.key} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-2xl font-bold text-indigo-700">{resumen[t.key]}</p>
            <p className="text-xs text-slate-500">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Últimas llamadas</h2>
        <Link href="/llamadas" className="text-sm text-indigo-700 hover:underline">
          Ver todas →
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Número</th>
              <th className="px-4 py-2 font-medium">Duración</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ultimas.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/llamadas/${l.id}`}>{formatFechaHora(l.iniciada_en)}</Link>
                </td>
                <td className="px-4 py-3">{l.direccion === "entrante" ? l.numero_origen : l.numero_destino}</td>
                <td className="px-4 py-3">{formatDuracion(l.duracion_segundos)}</td>
                <td className="px-4 py-3">{etiquetaEstado(l.estado)}</td>
                <td className="max-w-xs truncate px-4 py-3 text-slate-600">{l.resumen_motivo ?? "—"}</td>
              </tr>
            ))}
            {ultimas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No hay llamadas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
