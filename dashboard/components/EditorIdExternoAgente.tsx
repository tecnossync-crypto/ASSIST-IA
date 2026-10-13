"use client";

import { useActionState, useState } from "react";
import { Hash, ShieldAlert, X, Loader2, Pencil } from "lucide-react";
import { cambiarIdExternoAgenteAction, type EstadoIdExterno } from "@/app/(app)/configuracion/agentes/actions";

const ESTADO_INICIAL: EstadoIdExterno = {};

/** Id/código de este usuario en un sistema externo (CRM, SalesIQ, etc.). Si la
 *  plataforma externa manda este valor en el campo `operador` al pedir una llamada
 *  de IA, el reparto "Al operador que originó la llamada" se la pasa a este asesor
 *  (también se reconoce por email o por nombre exacto). */
export function EditorIdExternoAgente({ id, valorInicial }: { id: string; valorInicial: string | null }) {
  const [editando, setEditando] = useState(false);
  const accionConId = cambiarIdExternoAgenteAction.bind(null, id);
  const [estado, formAction, cargando] = useActionState(accionConId, ESTADO_INICIAL);

  if (estado.ok && editando) setEditando(false);

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="flex items-center gap-1 text-sm text-indigo-700 hover:underline"
      >
        <Hash size={13} />
        {valorInicial ? `Id externo: ${valorInicial}` : "Agregar id externo"}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          name="idExterno"
          defaultValue={valorInicial ?? ""}
          placeholder="Id del operador en tu plataforma (ej. SalesIQ)"
          className="w-56 rounded-md border border-edge px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={cargando}
          className="ts-brand-button flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {cargando ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
          {cargando ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setEditando(false)} aria-label="Cancelar" className="text-muted hover:text-ink-2">
          <X size={14} />
        </button>
      </div>
      {estado.error && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <ShieldAlert size={12} /> {estado.error}
        </p>
      )}
    </form>
  );
}
