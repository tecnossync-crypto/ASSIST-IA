"use client";

import { useActionState, useState } from "react";
import { Pencil, X, ShieldAlert, Loader2 } from "lucide-react";
import { guardarInfoBasicaAction, type EstadoInfoBasica } from "@/app/(app)/contactos/[id]/actions";

const ESTADO_INICIAL: EstadoInfoBasica = {};
const CAMPO =
  "rounded-md border border-edge bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/**
 * Edición manual de nombre/apellido/número — antes solo se podían capturar
 * automáticamente durante una llamada, sin forma de corregir un error
 * (un nombre mal transcrito, un número con un dígito de más, etc.).
 */
export function EditorInfoBasicaContacto({
  contactoId,
  nombre,
  apellido,
  numero,
}: {
  contactoId: string;
  nombre: string | null;
  apellido: string | null;
  numero: string;
}) {
  const [editando, setEditando] = useState(false);
  const accionConId = guardarInfoBasicaAction.bind(null, contactoId);
  const [estado, formAction, cargando] = useActionState(accionConId, ESTADO_INICIAL);

  if (estado.ok && editando) setEditando(false);

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="flex items-center gap-1 text-xs text-indigo-700 hover:underline"
      >
        <Pencil size={11} />
        Editar
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input name="nombre" defaultValue={nombre ?? ""} placeholder="Nombre" className={CAMPO} />
        <input name="apellido" defaultValue={apellido ?? ""} placeholder="Apellido" className={CAMPO} />
        <input name="numero" defaultValue={numero} required placeholder="Número" className={CAMPO} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={cargando}
          className="ts-brand-button flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {cargando && <Loader2 size={12} className="animate-spin" />}
          {cargando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="flex items-center gap-1 text-xs text-muted hover:text-ink-2"
        >
          <X size={12} /> Cancelar
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
