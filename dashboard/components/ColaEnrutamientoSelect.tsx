"use client";

import { actualizarEnrutamientoColaAction } from "@/app/(app)/configuracion/agentes/actions";

const MODOS = [
  { valor: "todos", label: "Todos a la vez" },
  { valor: "round_robin", label: "Por turnos" },
  { valor: "disponibilidad", label: "Por disponibilidad" },
  { valor: "menos_llamadas", label: "Menos llamadas atendidas" },
  { valor: "ultimo_operador", label: "Al último operador" },
] as const;

export function ColaEnrutamientoSelect({ colaId, modoActual }: { colaId: string; modoActual: string }) {
  return (
    <form action={actualizarEnrutamientoColaAction}>
      <input type="hidden" name="id" value={colaId} />
      <select
        name="modo"
        defaultValue={modoActual}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-edge px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {MODOS.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.label}
          </option>
        ))}
      </select>
    </form>
  );
}
