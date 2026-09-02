import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { listarLlamadas } from "@/lib/api";
import { formatFechaHora, formatDuracion, etiquetaEstado } from "@/lib/format";
import { BuscadorLlamadas } from "@/components/BuscadorLlamadas";
import { LlamarAhora } from "@/components/LlamarAhora";

export default async function LlamadasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const { q, estado } = await searchParams;
  const llamadas = await listarLlamadas({ q, estado });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Llamadas</h1>
        <span className="text-sm text-slate-500">{llamadas.length} resultado(s)</span>
      </div>

      <LlamarAhora />

      <BuscadorLlamadas />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Dirección</th>
              <th className="px-4 py-2 font-medium">Número</th>
              <th className="px-4 py-2 font-medium">Duración</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Motivo</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {llamadas.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/llamadas/${l.id}`} className="block">
                    {formatFechaHora(l.iniciada_en)}
                  </Link>
                </td>
                <td className="px-4 py-3 capitalize">{l.direccion}</td>
                <td className="px-4 py-3">
                  {l.direccion === "entrante" ? l.numero_origen : l.numero_destino}
                </td>
                <td className="px-4 py-3">{formatDuracion(l.duracion_segundos)}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (l.estado === "completada"
                        ? "bg-green-100 text-green-800"
                        : l.estado === "transferida"
                          ? "bg-amber-100 text-amber-800"
                          : l.estado === "fallida"
                            ? "bg-red-100 text-red-800"
                            : "bg-indigo-100 text-indigo-800")
                    }
                  >
                    {etiquetaEstado(l.estado)}
                  </span>
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                  {l.resumen_motivo ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/llamadas/${l.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    <PlayCircle size={13} />
                    Ver grabación
                  </Link>
                </td>
              </tr>
            ))}
            {llamadas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
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
