"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { parseCSV } from "@/lib/csv";

export function ImportarContactos() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "cargando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  async function manejarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setEstado("cargando");
    setMensaje("");
    try {
      const texto = await archivo.text();
      const contactos = parseCSV(texto);
      if (contactos.length === 0) {
        setEstado("error");
        setMensaje("No se encontraron números en el archivo.");
        return;
      }

      const res = await fetch("/api/contactos/importar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error importando");

      setEstado("ok");
      setMensaje(`${data.insertados} nuevo(s), ${data.actualizados} actualizado(s).`);
      router.refresh();
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={estado === "cargando"}
        className="ts-brand-button flex w-fit items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
      >
        <Upload size={14} />
        {estado === "cargando" ? "Importando…" : "Importar contactos (CSV)"}
      </button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={manejarArchivo} className="hidden" />
      {mensaje && (
        <p className={`text-xs ${estado === "error" ? "text-red-600" : "text-slate-500"}`}>{mensaje}</p>
      )}
    </div>
  );
}
