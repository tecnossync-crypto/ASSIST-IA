"use client";

import { useEffect, useState } from "react";
import { PhoneOutgoing, Radio, X } from "lucide-react";
import type { LlamadaExterna } from "@/lib/api";
import { etiquetaEstado } from "@/lib/format";

const ETIQUETAS_ESTADO_COLOR: Record<string, string> = {
  en_curso: "bg-emerald-100 text-emerald-800",
  completada: "bg-indigo-100 text-indigo-800",
  fallida: "bg-red-100 text-red-800",
  transferida: "bg-amber-100 text-amber-800",
};

// Mini panel de "llamadas externas": muestra en vivo las llamadas que pidió
// una plataforma de terceros por webhook (click-to-call — ver Configuración
// → Integraciones, POST /api/webhooks/llamar-agente), para que se note que
// algo llegó de afuera y no del panel de teléfono. Se refresca solo y
// desaparece cuando no hay actividad reciente (últimos 30 min).
export function LlamadasExternasWidget() {
  const [llamadas, setLlamadas] = useState<LlamadaExterna[]>([]);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function refrescar() {
      try {
        const res = await fetch("/api/llamadas/externas", { cache: "no-store" });
        if (!res.ok || cancelado) return;
        const data = await res.json();
        if (!cancelado) setLlamadas(data.llamadas ?? []);
      } catch {
        // silencioso: se reintenta en el próximo tick
      }
    }
    refrescar();
    const intervalo = setInterval(refrescar, 4000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  if (llamadas.length === 0 || cerrado) return null;

  const hayActivas = llamadas.some((l) => l.estado === "en_curso");

  return (
    <div className="fixed bottom-6 left-3 z-50 w-[calc(100vw-1.5rem)] max-w-72 overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl shadow-slate-900/20 sm:left-6 sm:w-72">
      <div className="flex items-center justify-between gap-2 bg-gradient-to-br from-indigo-600 to-violet-700 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <Radio size={14} className={hayActivas ? "animate-pulse" : ""} />
          Llamadas externas
        </div>
        <button
          type="button"
          onClick={() => setCerrado(true)}
          className="text-white/70 hover:text-white"
          aria-label="Cerrar"
        >
          <X size={14} />
        </button>
      </div>
      <div className="max-h-64 divide-y divide-edge overflow-y-auto">
        {llamadas.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <PhoneOutgoing size={14} className="text-muted" />
              <div>
                <p className="text-ink">{l.numero_destino}</p>
                <p className="text-xs text-muted">vía {l.origen_externo}</p>
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                ETIQUETAS_ESTADO_COLOR[l.estado] ?? "bg-surface-2 text-muted"
              }`}
            >
              {etiquetaEstado(l.estado)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
