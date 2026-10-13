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
  {
    valor: "menos_llamadas",
    label: "Por menos llamadas atendidas",
    descripcion: "Se asigna a quien menos llamadas ha atendido hoy — reparte la carga de forma pareja.",
  },
  {
    valor: "ultimo_operador",
    label: "Al último operador",
    descripcion: "Se asigna al mismo agente que atendió la última llamada, si sigue disponible.",
  },
  {
    valor: "operador_origen",
    label: "Al operador que originó la llamada",
    descripcion:
      "Si la plataforma externa (ej. Zoho SalesIQ) manda qué operador disparó la llamada de IA (campo operador) y está activo, la transferencia le suena solo a él. Si ese operador no está activo o no se sabe quién fue, se asigna a UN asesor activo al azar (no suena en todos a la vez).",
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
            (modoActual === m.valor ? "border-indigo-300 bg-indigo-50/60" : "border-edge hover:border-edge")
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
            <span className="block text-sm font-medium text-ink">{m.label}</span>
            <span className="block text-xs text-muted">{m.descripcion}</span>
          </span>
        </label>
      ))}
    </form>
  );
}
