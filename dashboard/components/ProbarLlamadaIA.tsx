"use client";

import { useState } from "react";
import { PhoneCall, Loader2, CheckCircle2 } from "lucide-react";

// Dispara una llamada saliente con IA usando el guion ya guardado, para
// probar el prompt sin tener que pasar por Contactos o el panel de teléfono.
export function ProbarLlamadaIA() {
  const [numero, setNumero] = useState("");
  const [estado, setEstado] = useState<"idle" | "cargando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  async function probar() {
    if (!numero) return;
    setEstado("cargando");
    setMensaje("");
    try {
      const res = await fetch("/api/llamar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ numero }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error originando la llamada");
      setEstado("ok");
      setMensaje(`Llamando a ${numero}… recuerda guardar los cambios de arriba primero si acabas de editar el prompt.`);
      setTimeout(() => setEstado("idle"), 6000);
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <PhoneCall size={16} className="text-emerald-600" />
        Probar con una llamada
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Guarda los cambios primero — el bot usa el prompt tal como está guardado, no lo que hayas escrito sin guardar.
      </p>
      <div className="flex gap-2">
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value.replace(/[^\d+]/g, ""))}
          placeholder="+18095551234"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={probar}
          disabled={!numero || estado === "cargando"}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {estado === "cargando" ? <Loader2 size={14} className="animate-spin" /> : <PhoneCall size={14} />}
          Llamar ahora
        </button>
      </div>
      {estado === "ok" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 size={12} /> {mensaje}
        </p>
      )}
      {estado === "error" && <p className="mt-2 text-xs text-red-600">{mensaje}</p>}
    </section>
  );
}
