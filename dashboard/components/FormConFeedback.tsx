"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

/**
 * Envuelve un <form action={...}> de Server Action agregando: botón que se
 * deshabilita y dice "Guardando…" mientras corre, y un mensaje verde de
 * confirmación cuando termina. Reemplaza el <button> manual que cada
 * pantalla tenía antes — así todas las pantallas de Configuración se ven y
 * se comportan igual al guardar.
 */
export function FormConFeedback({
  action,
  children,
  submitLabel = "Guardar",
  mensajeExito = "Guardado correctamente.",
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  submitLabel?: string;
  mensajeExito?: string;
  className?: string;
}) {
  const [state, formAction, isPending] = useActionState<{ ts: number } | null, FormData>(
    async (_prev, formData) => {
      await action(formData);
      return { ts: Date.now() };
    },
    null
  );
  const [mostrarExito, setMostrarExito] = useState(false);

  useEffect(() => {
    if (!state) return;
    setMostrarExito(true);
    const t = setTimeout(() => setMostrarExito(false), 3000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="ts-brand-button rounded-md px-5 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 transition-colors disabled:opacity-60"
        >
          {isPending ? "Guardando…" : submitLabel}
        </button>
        {isPending && (
          <span className="flex items-center gap-1.5 text-sm text-indigo-600">
            <Loader2 size={14} className="animate-spin" />
            Aplicando cambios…
          </span>
        )}
        {!isPending && mostrarExito && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 size={14} />
            {mensajeExito}
          </span>
        )}
      </div>
    </form>
  );
}
