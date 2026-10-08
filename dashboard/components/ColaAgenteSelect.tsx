"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cambiarColaAgenteAction } from "@/app/(app)/configuracion/agentes/actions";

// Cambia el departamento de un agente que ya existe ("" = sin departamento).
export function ColaAgenteSelect({
  agenteId,
  colaActual,
  colas,
}: {
  agenteId: string;
  colaActual: string | null;
  colas: { id: string; nombre: string }[];
}) {
  const [valor, setValor] = useState(colaActual ?? "");
  const [resultado, setResultado] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [guardando, startTransition] = useTransition();

  useEffect(() => {
    setValor(colaActual ?? "");
  }, [colaActual]);

  function cambiar(nuevo: string) {
    const anterior = valor;
    setValor(nuevo);
    setResultado(null);
    startTransition(async () => {
      const r = await cambiarColaAgenteAction(agenteId, nuevo);
      setResultado(r);
      if (r.error) setValor(anterior);
      else setTimeout(() => setResultado(null), 2500);
    });
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      Departamento
      <select
        value={valor}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-md border border-edge px-2 py-1 text-xs text-ink focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">Sin departamento</option>
        {colas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      {guardando && <Loader2 size={12} className="animate-spin" />}
      {resultado?.ok && <CheckCircle2 size={13} className="text-emerald-600" aria-label="Guardado" />}
      {resultado?.error && (
        <span className="flex items-center gap-1 text-red-600" title={resultado.error}>
          <XCircle size={13} /> {resultado.error}
        </span>
      )}
    </label>
  );
}
