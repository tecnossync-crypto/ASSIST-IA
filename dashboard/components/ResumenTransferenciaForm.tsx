"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { guardarResumenTransferenciaAction } from "@/app/(app)/configuracion/enrutamiento/actions";

/**
 * Interruptor del contexto para el vendedor: cuando la IA transfiere una
 * llamada, el panel de teléfono muestra qué habló el cliente con el bot.
 * Se guarda al instante; controlado a propósito (ver DestinoEmpresaForm).
 */
export function ResumenTransferenciaForm({ activoInicial }: { activoInicial: boolean }) {
  const [activo, setActivo] = useState(activoInicial);
  const [resultado, setResultado] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [guardando, startTransition] = useTransition();

  useEffect(() => {
    setActivo(activoInicial);
  }, [activoInicial]);

  function cambiar(nuevo: boolean) {
    const anterior = activo;
    setActivo(nuevo);
    setResultado(null);
    startTransition(async () => {
      const r = await guardarResumenTransferenciaAction(nuevo);
      setResultado(r);
      if (r.error) setActivo(anterior);
      else setTimeout(() => setResultado(null), 2500);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-edge p-3 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50/60 dark:has-[:checked]:bg-indigo-500/10">
        <input
          type="checkbox"
          checked={activo}
          disabled={guardando}
          onChange={(e) => cambiar(e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="block text-sm font-medium text-ink">
            Mostrar al vendedor el resumen de la conversación con la IA
          </span>
          <span className="block text-xs text-muted">
            Cuando la IA transfiere una llamada, en el panel de teléfono aparece una pestaña &quot;Contexto&quot; con lo
            que quiere el cliente, los datos que ya dio y la conversación, para que no tenga que repetirlo todo.
          </span>
        </span>
      </label>
      <div className="h-4 text-xs">
        {guardando && (
          <span className="flex items-center gap-1.5 text-muted">
            <Loader2 size={12} className="animate-spin" /> Guardando…
          </span>
        )}
        {resultado?.ok && (
          <span className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 size={12} /> Guardado.
          </span>
        )}
        {resultado?.error && (
          <span className="flex items-center gap-1.5 text-red-600">
            <XCircle size={12} /> {resultado.error}
          </span>
        )}
      </div>
    </div>
  );
}
