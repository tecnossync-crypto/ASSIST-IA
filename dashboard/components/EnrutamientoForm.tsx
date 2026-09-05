"use client";

import { actualizarEnrutamientoAction } from "@/app/(app)/configuracion/agentes/actions";

const MODOS = [
  {
    valor: "todos",
    label: "Suena en todos",
    descripcion: "Todos los agentes disponibles reciben la llamada a la vez; el primero que conteste se la queda.",
  },
  {
    valor: "round_robin",
    label: "Por turnos (round robin)",
    descripcion: "Se asigna a un solo agente, rotando en orden entre los disponibles.",
  },
  {
    valor: "disponibilidad",
    label: "Por disponibilidad",
    descripcion: "Se asigna al agente que lleva más tiempo esperando disponible.",
  },
] as const;

export function EnrutamientoForm({ modoActual }: { modoActual: string }) {
  return (
    <form action={actualizarEnrutamientoAction} className="flex flex-col gap-2">
      {MODOS.map((m) => (
        <label
          key={m.valor}
          className={
            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors " +
            (modoActual === m.valor ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 hover:border-slate-300")
          }
        >
          <input
            type="radio"
            name="modo"
            value={m.valor}
            defaultChecked={modoActual === m.valor}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="mt-1 accent-indigo-600"
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">{m.label}</span>
            <span className="block text-xs text-slate-500">{m.descripcion}</span>
          </span>
        </label>
      ))}
    </form>
  );
}
