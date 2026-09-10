"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ChevronLeft, ChevronRight, ChevronRight as FlechaFila } from "lucide-react";
import { formatFechaHoraCorta } from "@/lib/format";
import type { WebhookRecibido } from "@/lib/api";

const ETIQUETAS_ENDPOINT: Record<string, string> = {
  "llamar-agente": "Llamar a un agente",
  llamadas: "Llamar con IA",
  contactos: "Actualizar contacto",
  prueba: "URL de prueba",
};

const TAMANO_PAGINA = 25;

/** Registros del API — lista tipo tabla (igual que Llamadas), cada fila
 *  lleva a su propia página de detalle en vez de mostrar todo inline. */
export function PanelLogsWebhooks() {
  const [solicitudes, setSolicitudes] = useState<WebhookRecibido[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [endpoint, setEndpoint] = useState("");
  const [ok, setOk] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    const params = new URLSearchParams({
      limite: String(TAMANO_PAGINA),
      offset: String(pagina * TAMANO_PAGINA),
    });
    if (endpoint) params.set("endpoint", endpoint);
    if (ok) params.set("ok", ok);

    fetch(`/api/logs-webhooks?${params.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelado) return;
        setSolicitudes(data.solicitudes ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => !cancelado && setCargando(false));

    return () => {
      cancelado = true;
    };
  }, [pagina, endpoint, ok]);

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={endpoint}
          onChange={(e) => {
            setEndpoint(e.target.value);
            setPagina(0);
          }}
          className="rounded-md border border-edge px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todos los endpoints</option>
          {Object.entries(ETIQUETAS_ENDPOINT).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <select
          value={ok}
          onChange={(e) => {
            setOk(e.target.value);
            setPagina(0);
          }}
          className="rounded-md border border-edge px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Todos los resultados</option>
          <option value="true">Solo OK</option>
          <option value="false">Solo error</option>
        </select>
        {cargando && <Loader2 size={14} className="animate-spin text-muted" />}
        <span className="ml-auto text-xs text-muted">{total} registro(s)</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-edge bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Fecha</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Endpoint</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Resultado</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Origen</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {solicitudes.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/api-logs/${s.id}`} className="block">
                      {formatFechaHoraCorta(s.creado_en)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {ETIQUETAS_ENDPOINT[s.endpoint] ?? s.endpoint}
                    </span>
                    {s.es_prueba && <span className="ml-1.5 text-xs text-muted">(prueba)</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {s.ok ? "OK" : "Error"}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-ink-2">
                    {typeof s.body?.origen === "string" ? s.body.origen : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/api-logs/${s.id}`} className="inline-flex items-center text-indigo-700 hover:underline">
                      Ver <FlechaFila size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
              {solicitudes.length === 0 && !cargando && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    No hay registros con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagina === 0}
            className="flex items-center gap-1 rounded-md border border-edge px-2.5 py-1.5 text-xs disabled:opacity-40"
          >
            <ChevronLeft size={13} /> Anterior
          </button>
          <span className="text-xs text-muted">
            Página {pagina + 1} de {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
            disabled={pagina >= totalPaginas - 1}
            className="flex items-center gap-1 rounded-md border border-edge px-2.5 py-1.5 text-xs disabled:opacity-40"
          >
            Siguiente <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
