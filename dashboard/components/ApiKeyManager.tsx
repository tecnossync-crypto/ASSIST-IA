"use client";

import { useState } from "react";
import { Copy, Check, KeyRound, RefreshCw } from "lucide-react";
import { regenerarApiKeyAction } from "@/app/(app)/configuracion/integraciones/actions";
import { OverlayGuardando } from "./OverlayGuardando";

function enmascarar(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 8)}${"•".repeat(20)}${key.slice(-4)}`;
}

export function ApiKeyManager({ apiKeyActual }: { apiKeyActual: string | null }) {
  const [apiKey, setApiKey] = useState(apiKeyActual);
  const [revelada, setRevelada] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [generando, setGenerando] = useState(false);

  async function regenerar() {
    const confirmado = apiKey
      ? window.confirm("Esto invalida el API key actual — cualquier integración que ya lo esté usando dejará de funcionar. ¿Continuar?")
      : true;
    if (!confirmado) return;

    setGenerando(true);
    try {
      const { apiKey: nueva } = await regenerarApiKeyAction();
      setApiKey(nueva);
      setRevelada(true);
    } finally {
      setGenerando(false);
    }
  }

  function copiar() {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="relative flex flex-col gap-3">
      <OverlayGuardando estado={generando ? "guardando" : null} mensajeGuardando="Generando API key…" />

      {apiKey ? (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-edge bg-surface-2 px-3 py-2 font-mono text-sm text-ink-2">
            <KeyRound size={14} className="text-indigo-500" />
            <span className="truncate">{revelada ? apiKey : enmascarar(apiKey)}</span>
          </div>
          <button
            type="button"
            onClick={() => setRevelada((r) => !r)}
            className="rounded-md border border-edge px-2.5 py-2 text-xs text-ink-2 hover:bg-surface-2"
          >
            {revelada ? "Ocultar" : "Ver"}
          </button>
          <button
            type="button"
            onClick={copiar}
            className="flex items-center gap-1 rounded-md border border-edge px-2.5 py-2 text-xs text-ink-2 hover:bg-surface-2"
          >
            {copiado ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">Todavía no has generado un API key.</p>
      )}

      <button
        type="button"
        onClick={regenerar}
        disabled={generando}
        className="flex w-fit items-center gap-1.5 rounded-md border border-dashed border-edge px-3 py-1.5 text-xs text-ink-2 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-60"
      >
        <RefreshCw size={13} />
        {apiKey ? "Regenerar" : "Generar API key"}
      </button>
    </div>
  );
}
