"use client";

import { useState } from "react";
import { actualizarExtensionCentralPropiaColaAction } from "@/app/(app)/configuracion/agentes/actions";

// Extensión/interno de la central propia (Grandstream) al que se transfiere
// una llamada de IA de esta cola cuando no hay agentes de la plataforma
// disponibles. Vacío = esta cola sigue funcionando igual que siempre (solo
// agentes conectados al dashboard).
export function ColaExtensionCentralPropia({
  colaId,
  valorInicial,
}: {
  colaId: string;
  valorInicial: string | null;
}) {
  const [guardando, setGuardando] = useState(false);

  return (
    <form
      action={async (formData) => {
        setGuardando(true);
        try {
          await actualizarExtensionCentralPropiaColaAction(formData);
        } finally {
          setGuardando(false);
        }
      }}
      className="flex items-center gap-1.5"
      title="Extensión de tu central propia (Grandstream) a la que se transfiere esta cola si no hay agentes disponibles en la plataforma"
    >
      <input type="hidden" name="id" value={colaId} />
      <input
        name="extension"
        defaultValue={valorInicial ?? ""}
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        placeholder="Ext. central (opcional)"
        disabled={guardando}
        className="w-36 rounded-md border border-edge px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      />
    </form>
  );
}
