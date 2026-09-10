"use client";

import { useEffect, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatFechaHora } from "@/lib/format";
import type { WebhookRecibido } from "@/lib/api";

const ETIQUETAS_ENDPOINT: Record<string, string> = {
  "llamar-agente": "Llamar a un agente",
  llamadas: "Llamar con IA",
  contactos: "Actualizar contacto",
  prueba: "URL de prueba",
};

const TAMANO_PAGINA = 20;

/** Panel completo de "todas las llamadas API y los logs" — con filtros por
 *  endpoint/resultado y paginación, a diferencia del preview de las
 *  últimas 10 que se ve directo en Integraciones. */
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
        <span className="ml-auto text-xs text-muted">{total} solicitud(es)</span>
      </div>

      {solicitudes.length === 0 && !cargando ? (
        <p className="rounded-lg border border-dashed border-edge p-6 text-center text-sm text-muted">
          No hay solicitudes con ese filtro.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-edge rounded-lg border border-edge bg-surface">
          {solicitudes.map((s) => (
            <div key={s.id} className="p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {ETIQUETAS_ENDPOINT[s.endpoint] ?? s.endpoint}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {s.ok ? "OK" : "Error"}
                </span>
                {s.es_prueba && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Prueba manual</span>
                )}
                {s.call_sid && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink-2">
                    {s.call_sid}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted">{formatFechaHora(s.creado_en)}</span>
              </div>
              <pre className="overflow-x-auto rounded-md bg-surface-2 p-2 text-xs text-ink-2">
                <code>
                  {typeof s.body?.crudo === "string" ? s.body.crudo || "(vacío)" : JSON.stringify(s.body, null, 2)}
                </code>
              </pre>
              {s.error && <p className="mt-1 text-xs text-red-600">{s.error}</p>}
            </div>
          ))}
        </div>
      )}

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
