"use client";

import { useActionState, useEffect, useState } from "react";
import { OverlayGuardando } from "./OverlayGuardando";

/**
 * Envuelve un <form action={...}> de Server Action agregando un overlay
 * bloqueante mientras guarda (como una transacción bancaria: tapa el
 * formulario, no deja tocar nada hasta que termina) y un check verde de
 * confirmación al terminar. Así todas las pantallas de Configuración se ven
 * y se comportan igual al guardar.
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
    const t = setTimeout(() => setMostrarExito(false), 1800);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form action={formAction} className={`relative ${className ?? ""}`}>
      <OverlayGuardando estado={isPending ? "guardando" : mostrarExito ? "ok" : null} mensajeExito={mensajeExito} />
      {children}
      <div className="mt-4">
        <button
          type="submit"
          disabled={isPending}
          className="ts-brand-button rounded-md px-5 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 transition-colors disabled:opacity-60"
        >
          {isPending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
