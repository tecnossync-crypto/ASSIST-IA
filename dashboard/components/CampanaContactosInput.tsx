"use client";

import { useState } from "react";
import { Tag, Loader2 } from "lucide-react";
import { ImportarContactosCSV } from "./ImportarContactosCSV";
import type { EtiquetaDisponible } from "@/lib/api";

export function CampanaContactosInput({ etiquetas }: { etiquetas: EtiquetaDisponible[] }) {
  const [valor, setValor] = useState("");
  const [etiquetaElegida, setEtiquetaElegida] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function agregarPorEtiqueta() {
    if (!etiquetaElegida) return;
    setCargando(true);
    setMensaje("");
    try {
      const res = await fetch(`/api/contactos/por-etiqueta?etiqueta=${encodeURIComponent(etiquetaElegida)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error buscando contactos");

      const existentes = new Set(
        valor
          .split("\n")
          .map((l) => l.split(",")[0]?.trim())
          .filter(Boolean)
      );
      const nuevas = (data.contactos as { numero: string; nombre: string | null; apellido: string | null }[])
        .filter((c) => !existentes.has(c.numero))
        .map((c) => {
          const nombreCompleto = [c.nombre, c.apellido].filter(Boolean).join(" ");
          return nombreCompleto ? `${c.numero}, ${nombreCompleto}` : c.numero;
        });

      if (nuevas.length === 0) {
        setMensaje("No hay contactos nuevos con esa etiqueta (o ya estaban en la lista).");
      } else {
        setValor((v) => (v.trim() ? `${v.trim()}\n${nuevas.join("\n")}` : nuevas.join("\n")));
        setMensaje(`Se agregaron ${nuevas.length} contacto(s) con la etiqueta "${etiquetaElegida}".`);
      }
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {etiquetas.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-2">
          <Tag size={14} className="flex-shrink-0 text-indigo-600" />
          <select
            value={etiquetaElegida}
            onChange={(e) => setEtiquetaElegida(e.target.value)}
            className="flex-1 rounded-md border border-edge bg-surface px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Agregar contactos por etiqueta…</option>
            {etiquetas.map((e) => (
              <option key={e.nombre} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={agregarPorEtiqueta}
            disabled={!etiquetaElegida || cargando}
            className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {cargando && <Loader2 size={12} className="animate-spin" />}
            Agregar
          </button>
        </div>
      )}
      {mensaje && <p className="text-xs text-muted">{mensaje}</p>}

      <textarea
        id="contactos"
        name="contactos"
        required
        rows={6}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={"+18095551234, Juan Pérez\n+18095555678"}
        className="rounded-md border border-edge px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <p className="text-xs text-muted">Un número por línea. Formato: número o número, nombre.</p>
      <ImportarContactosCSV
        onImportar={(texto) => setValor((v) => (v.trim() ? `${v.trim()}\n${texto}` : texto))}
      />
    </div>
  );
}
