"use client";

import { Printer } from "lucide-react";

// Abre el cuadro de impresión del navegador: ahí se elige "Guardar como PDF". La pantalla tiene estilos de impresión
// (sin menú ni botones) para que el PDF salga limpio.
export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 print:hidden"
    >
      <Printer size={15} />
      Imprimir / PDF
    </button>
  );
}
