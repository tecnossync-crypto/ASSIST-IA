"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Muestra la dirección que hay que pegar en las Opciones de la extensión de
 * Chrome: es la de ESTA pantalla (el dashboard). Se lee del navegador para que
 * nadie tenga que adivinarla — poner la del backend/webhooks daba un error de
 * "Route GET:/extension-panel not found".
 */
export function DireccionExtension() {
  const [direccion, setDireccion] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setDireccion(window.location.origin);
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(direccion);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sin permiso de portapapeles: se puede seleccionar y copiar a mano
    }
  }

  if (!direccion) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
      Dirección para las Opciones de la extensión:
      <code className="rounded bg-surface-2 px-2 py-1 font-mono text-ink-2">{direccion}</code>
      <button
        type="button"
        onClick={copiar}
        className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-ink-2 hover:bg-surface-2"
      >
        {copiado ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
        {copiado ? "Copiada" : "Copiar"}
      </button>
    </div>
  );
}
