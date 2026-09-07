"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { eliminarContactoAction } from "@/app/(app)/contactos/[id]/actions";

// No usa el BotonAccion genérico a propósito: acá hace falta navegar de
// vuelta a /contactos después de borrar, y BotonAccion no está pensado para
// eso (además de que redirect() dentro de esa acción se leería como error).
export function BotonEliminarContacto({ contactoId, nombre }: { contactoId: string; nombre: string }) {
  const router = useRouter();
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");

  async function eliminar() {
    if (!window.confirm(`¿Eliminar el contacto "${nombre}"? Esto no se puede deshacer.`)) return;
    setEliminando(true);
    setError("");
    try {
      await eliminarContactoAction(contactoId);
      router.push("/contactos");
    } catch (err) {
      setEliminando(false);
      setError(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={eliminar}
        disabled={eliminando}
        className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-xs text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
      >
        {eliminando ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        {eliminando ? "Eliminando…" : "Eliminar contacto"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
