"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { actualizarEnrutamientoColaAction } from "@/app/(app)/configuracion/agentes/actions";

const MODOS = [
  { valor: "todos", label: "Todos a la vez" },
  { valor: "round_robin", label: "Por turnos" },
  { valor: "disponibilidad", label: "Por disponibilidad" },
  { valor: "menos_llamadas", label: "Menos llamadas atendidas" },
  { valor: "ultimo_operador", label: "Al último operador" },
] as const;

export function ColaEnrutamientoSelect({ colaId, modoActual }: { colaId: string; modoActual: string }) {
  const [valor, setValor] = useState(modoActual);
  const [resultado, setResultado] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [guardando, startTransition] = useTransition();

  // Si el dato del servidor cambia (se refrescó la página), el selector lo sigue.
  useEffect(() => {
    setValor(modoActual);
  }, [modoActual]);

  function cambiar(nuevo: string) {
    const anterior = valor;
    setValor(nuevo);
    setResultado(null);
    startTransition(async () => {
      const r = await actualizarEnrutamientoColaAction(colaId, nuevo);
      setResultado(r);
      if (r.error) setValor(anterior);
      else setTimeout(() => setResultado(null), 2500);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={valor}
        disabled={guardando}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-md border border-edge px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
      >
        {MODOS.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.label}
          </option>
        ))}
      </select>
      {guardando && <Loader2 size={12} className="animate-spin text-muted" />}
      {resultado?.ok && <CheckCircle2 size={13} className="text-emerald-600" aria-label="Guardado" />}
      {resultado?.error && (
        <span className="flex items-center gap-1 text-xs text-red-600" title={resultado.error}>
          <XCircle size={13} /> {resultado.error}
        </span>
      )}
    </div>
  );
}
