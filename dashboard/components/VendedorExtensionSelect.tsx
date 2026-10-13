"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cambiarVendedorExtensionAction } from "@/app/(app)/configuracion/enrutamiento/actions";

// Vendedor al que pertenece una extensión de la central (su teléfono físico). "" = ninguno.
export function VendedorExtensionSelect({
  extensionId,
  usuarioActual,
  agentes,
}: {
  extensionId: string;
  usuarioActual: string | null;
  agentes: { id: string; nombre: string }[];
}) {
  const [valor, setValor] = useState(usuarioActual ?? "");
  const [resultado, setResultado] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [guardando, startTransition] = useTransition();

  useEffect(() => {
    setValor(usuarioActual ?? "");
  }, [usuarioActual]);

  function cambiar(nuevo: string) {
    const anterior = valor;
    setValor(nuevo);
    setResultado(null);
    startTransition(async () => {
      const r = await cambiarVendedorExtensionAction(extensionId, nuevo);
      setResultado(r);
      if (r.error) setValor(anterior);
      else setTimeout(() => setResultado(null), 2500);
    });
  }

  return (
    <div
      className="flex items-center gap-1.5"
      title="Vendedor dueño de este teléfono: con el reparto «Al operador que originó la llamada», le suena a su extensión"
    >
      <select
        value={valor}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-md border border-edge bg-surface px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">Sin vendedor asignado</option>
        {agentes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
          </option>
        ))}
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
