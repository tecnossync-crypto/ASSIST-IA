"use client";

import { useState } from "react";
import { Headphones, Mic, MicOff, X, Loader2 } from "lucide-react";

type Estado = "idle" | "conectando" | "escuchando" | "interviniendo";

/**
 * Botón de monitoreo en vivo para el admin, en el detalle de una llamada
 * "en_curso": une su softphone (el mismo de Configuración → Agentes, con su
 * propio PIN) a la conferencia para escuchar sin ser notado, con opción de
 * intervenir (hablar) si hace falta. Requiere que el admin haya iniciado su
 * softphone (widget flotante, ícono de teléfono) con su PIN — si no, Twilio
 * no tiene a dónde llamarlo.
 */
export function MonitoreoLlamada({ llamadaId }: { llamadaId: string }) {
  const [estado, setEstado] = useState<Estado>("idle");
  const [sesionEscucha, setSesionEscucha] = useState<{ conferenciaSid: string; participanteCallSid: string } | null>(
    null
  );
  const [error, setError] = useState("");

  async function escuchar() {
    setEstado("conectando");
    setError("");
    try {
      const res = await fetch("/api/monitoreo/escuchar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ llamadaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo unir a la llamada");
      setSesionEscucha(data);
      setEstado("escuchando");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setEstado("idle");
    }
  }

  async function alternarIntervenir() {
    if (!sesionEscucha) return;
    const activar = estado !== "interviniendo";
    try {
      await fetch("/api/monitoreo/intervenir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...sesionEscucha, activar }),
      });
      setEstado(activar ? "interviniendo" : "escuchando");
    } catch {
      setError("No se pudo cambiar de modo");
    }
  }

  async function salir() {
    if (sesionEscucha) {
      await fetch("/api/monitoreo/salir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participanteCallSid: sesionEscucha.participanteCallSid }),
      }).catch(() => {});
    }
    setSesionEscucha(null);
    setEstado("idle");
  }

  if (estado === "idle") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={escuchar}
          className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
        >
          <Headphones size={13} />
          Escuchar en vivo
        </button>
        {error && <p className="max-w-[220px] text-right text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  if (estado === "conectando") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <Loader2 size={13} className="animate-spin" /> Conectando…
      </span>
    );
  }

  const interviniendo = estado === "interviniendo";

  return (
    <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-3 pr-1.5">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      <span className="text-xs font-medium text-emerald-800">
        {interviniendo ? "Interviniendo" : "Escuchando"}
      </span>
      <button
        type="button"
        onClick={alternarIntervenir}
        title={interviniendo ? "Dejar de hablar" : "Intervenir (hablar)"}
        className={
          "flex h-6 w-6 items-center justify-center rounded-full " +
          (interviniendo ? "bg-amber-500 text-white" : "bg-white text-emerald-700 hover:bg-emerald-100")
        }
      >
        {interviniendo ? <MicOff size={12} /> : <Mic size={12} />}
      </button>
      <button
        type="button"
        onClick={salir}
        title="Dejar de escuchar"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 hover:bg-red-50 hover:text-red-600"
      >
        <X size={12} />
      </button>
    </div>
  );
}
