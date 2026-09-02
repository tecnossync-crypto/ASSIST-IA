"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const ESTADOS = [
  { value: "", label: "Todos los estados" },
  { value: "en_curso", label: "En curso" },
  { value: "completada", label: "Completada" },
  { value: "transferida", label: "Transferida" },
  { value: "fallida", label: "Fallida" },
];

export function BuscadorLlamadas() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

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
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        actualizar({ q });
      }}
    >
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por número o motivo…"
        className="flex-1 min-w-[220px] rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <select
        defaultValue={searchParams.get("estado") ?? ""}
        onChange={(e) => actualizar({ estado: e.target.value })}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        {ESTADOS.map((e) => (
          <option key={e.value} value={e.value}>
            {e.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Buscar
      </button>
    </form>
  );
}
