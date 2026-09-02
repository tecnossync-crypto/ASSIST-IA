"use client";

import { useState } from "react";

export function LlamarAhora() {
  const [numero, setNumero] = useState("");
  const [estado, setEstado] = useState<"idle" | "cargando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  async function llamar(e: React.FormEvent) {
    e.preventDefault();
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
      setMensaje(`Llamando… (SID: ${data.callSid})`);
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <form onSubmit={llamar} className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <span className="text-sm font-medium text-indigo-900">Llamar ahora:</span>
      <input
        type="tel"
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
        placeholder="+18095551234"
        required
        className="min-w-[180px] rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        type="submit"
        disabled={estado === "cargando"}
        className="ts-brand-button rounded-md px-4 py-1.5 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
      >
        {estado === "cargando" ? "Llamando…" : "Llamar"}
      </button>
      {mensaje && (
        <span className={`text-sm ${estado === "error" ? "text-red-600" : "text-indigo-700"}`}>{mensaje}</span>
      )}
    </form>
  );
}
