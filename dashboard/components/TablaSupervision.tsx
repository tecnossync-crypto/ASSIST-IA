"use client";

import { useEffect, useState } from "react";
import { PhoneIncoming, PhoneOutgoing, Radio } from "lucide-react";
import type { LlamadaActiva } from "@/lib/api";
import { MonitoreoLlamada } from "./MonitoreoLlamada";

function formatDuracionEnVivo(iniciadaEn: string): string {
  const segundos = Math.max(0, Math.floor((Date.now() - new Date(iniciadaEn).getTime()) / 1000));
  const m = String(Math.floor(segundos / 60)).padStart(2, "0");
  const s = String(segundos % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Vista en vivo de "Supervisión": todas las llamadas en curso ahora mismo,
 * con qué agente las está atendiendo — se refresca sola cada pocos segundos
 * (no hace falta que el supervisor recargue la página para ver una llamada
 * nueva que acaba de entrar, o una que ya terminó desaparecer de la lista).
 */
export function TablaSupervision({ llamadasIniciales }: { llamadasIniciales: LlamadaActiva[] }) {
  const [llamadas, setLlamadas] = useState(llamadasIniciales);
  const [, forzarRender] = useState(0);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/supervision/activas", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setLlamadas(data.llamadas ?? []);
      } catch {
        // silencioso: se reintenta en el próximo tick
      }
    }, 4000);

    const ticker = setInterval(() => forzarRender((n) => n + 1), 1000);

    return () => {
      clearInterval(poll);
      clearInterval(ticker);
    };
  }, []);

  if (llamadas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge p-8 text-center">
        <Radio size={22} className="mx-auto mb-2 text-slate-300" />
        <p className="text-sm text-muted">No hay llamadas activas en este momento.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Dirección</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Cliente</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Cola</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Agente</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Duración</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {llamadas.map((l) => (
              <tr key={l.id} className="hover:bg-surface-2">
                <td className="whitespace-nowrap px-4 py-3">
                  {l.direccion === "entrante" ? (
                    <PhoneIncoming size={14} className="text-sky-500" />
                  ) : (
                    <PhoneOutgoing size={14} className="text-violet-500" />
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {l.direccion === "entrante" ? l.numero_origen : l.numero_destino}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-2">{l.cola_nombre ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {l.agente_nombre ? (
                    <span className="flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      </span>
                      {l.agente_nombre}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600">Esperando que contesten…</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink-2">
                  {formatDuracionEnVivo(l.iniciada_en)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {l.agente_call_sid ? (
                    <MonitoreoLlamada llamadaId={l.id} />
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
