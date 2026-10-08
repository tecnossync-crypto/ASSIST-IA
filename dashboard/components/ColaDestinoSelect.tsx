"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { guardarDestinoColaAction } from "@/app/(app)/configuracion/enrutamiento/actions";
import type { DestinoLlamadas } from "@/lib/api";

// "" = sin destino propio: usa el de la empresa.
export function ColaDestinoSelect({ colaId, destinoActual }: { colaId: string; destinoActual: DestinoLlamadas | null }) {
  const [valor, setValor] = useState<string>(destinoActual ?? "");
  const [resultado, setResultado] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [guardando, startTransition] = useTransition();

  // Si el dato del servidor cambia (se refrescó la página), el selector lo sigue.
  useEffect(() => {
    setValor(destinoActual ?? "");
  }, [destinoActual]);

  function cambiar(nuevo: string) {
    const anterior = valor;
    setValor(nuevo);
    setResultado(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", colaId);
      formData.set("destino", nuevo);
      const r = await guardarDestinoColaAction(formData);
      setResultado(r);
      if (r.error) setValor(anterior);
      else setTimeout(() => setResultado(null), 2500);
    });
  }

  return (
    <div className="flex items-center gap-1.5" title="Dónde se atienden las llamadas transferidas a este departamento">
      <select
        value={valor}
        disabled={guardando}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-md border border-edge px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
      >
        <option value="">Usar el de la empresa</option>
        <option value="plataforma">Digital (web)</option>
        <option value="central">Teléfonos físicos</option>
        <option value="ambos">Digital + respaldo físico</option>
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
