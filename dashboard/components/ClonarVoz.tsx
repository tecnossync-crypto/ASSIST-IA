"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2, CheckCircle2, Upload } from "lucide-react";

// Sube un audio (1-5 min recomendado por ElevenLabs) y clona la voz del
// bot a partir de él. Al terminar, la empresa queda usando esa voz
// (tts_provider="elevenlabs") automáticamente — no hace falta tocar nada
// más en el selector de voz de arriba.
export function ClonarVoz() {
  const router = useRouter();
  const [nombreVoz, setNombreVoz] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<"idle" | "subiendo" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  async function clonar() {
    if (!nombreVoz || !archivo) return;
    setEstado("subiendo");
    setMensaje("");
    try {
      const formData = new FormData();
      formData.set("nombreVoz", nombreVoz);
      formData.set("audio", archivo);

      const res = await fetch("/api/clonar-voz", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error clonando la voz");

      setEstado("ok");
      setMensaje(`Voz "${nombreVoz}" clonada y activada. Recarga la página para verla seleccionada arriba.`);
      router.refresh();
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Mic size={16} className="text-violet-600" />
        Clonar voz (ElevenLabs)
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Sube un audio de 1 a 5 minutos con la voz que quieres que use el bot (idealmente limpio, sin ruido de
        fondo ni música). Se crea una voz clonada y queda activada automáticamente.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={nombreVoz}
          onChange={(e) => setNombreVoz(e.target.value)}
          placeholder="Nombre para esta voz (ej. Voz oficial VRA)"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:border-violet-400">
          <Upload size={14} />
          {archivo ? archivo.name : "Elegir audio"}
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          onClick={clonar}
          disabled={!nombreVoz || !archivo || estado === "subiendo"}
          className="flex items-center justify-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {estado === "subiendo" ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
          Clonar
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
