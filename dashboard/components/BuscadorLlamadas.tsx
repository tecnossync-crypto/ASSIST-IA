"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";

const ESTADOS = [
  { value: "", label: "Todos los estados" },
  { value: "en_curso", label: "En curso" },
  { value: "completada", label: "Completada" },
  { value: "transferida", label: "Transferida" },
  { value: "fallida", label: "Fallida" },
];

const CAMPO =
  "rounded-lg border border-edge bg-surface text-sm text-ink focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export function BuscadorLlamadas() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const hayFiltros = Boolean(searchParams.get("q") || searchParams.get("estado"));

  function actualizar(nuevos: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(nuevos)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/llamadas?${params.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-xl border border-edge bg-surface p-2 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        actualizar({ q });
      }}
    >
      <div className="relative min-w-[220px] flex-1">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por número o motivo…"
          className={`${CAMPO} w-full py-2 pl-9 pr-3`}
        />
      </div>
      <select
        value={searchParams.get("estado") ?? ""}
        onChange={(e) => actualizar({ estado: e.target.value })}
        className={`${CAMPO} px-3 py-2`}
        aria-label="Filtrar por estado"
      >
        {ESTADOS.map((e) => (
          <option key={e.value} value={e.value}>
            {e.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="ts-brand-button rounded-lg px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 transition-colors"
      >
        Buscar
      </button>
      {hayFiltros && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            router.push("/llamadas");
          }}
          className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X size={14} />
          Limpiar
        </button>
      )}
    </form>
  );
}
