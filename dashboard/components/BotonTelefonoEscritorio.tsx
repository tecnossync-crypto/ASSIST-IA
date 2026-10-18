"use client";

import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { puenteEscritorio } from "@/lib/escritorio";

// Solo dentro de la app de escritorio: muestra el teléfono flotante (que vive en su propia ventana).
export function BotonTelefonoEscritorio() {
  const [hay, setHay] = useState(false);
  useEffect(() => setHay(puenteEscritorio() !== null), []);
  if (!hay) return null;
  return (
    <button
      type="button"
      onClick={() => puenteEscritorio()?.mostrarTelefono()}
      title="Mostrar el teléfono (Ctrl+Alt+P)"
      className="flex items-center gap-1.5 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-2"
    >
      <Phone size={13} className="text-indigo-600" />
      Teléfono
    </button>
  );
}
