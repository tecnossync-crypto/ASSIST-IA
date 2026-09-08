"use client";

import { useActionState, useState } from "react";
import { KeyRound, ShieldAlert, CheckCircle2, X } from "lucide-react";
import { cambiarPasswordAgenteAction, type EstadoPassword } from "@/app/(app)/configuracion/agentes/actions";

const ESTADO_INICIAL: EstadoPassword = {};

// Cambiar la contraseña de un usuario ya existente (ej. el admin) sin tener
// que borrarlo y crearlo de nuevo. Solo aplica a usuarios con acceso al
// dashboard (password_hash) — los agentes de solo PIN no la necesitan.
export function CambiarPasswordAgente({ id, nombre }: { id: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const accionConId = cambiarPasswordAgenteAction.bind(null, id);
  const [estado, formAction, cargando] = useActionState(accionConId, ESTADO_INICIAL);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1 text-sm text-indigo-700 hover:underline"
      >
        <KeyRound size={13} />
        Cambiar contraseña
      </button>
    );
  }

  if (estado.ok) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600">
        <CheckCircle2 size={12} /> Contraseña actualizada.
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder={`Nueva contraseña para ${nombre}`}
          className="w-56 rounded-md border border-edge px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={cargando}
          className="ts-brand-button rounded-md px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {cargando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          aria-label="Cancelar"
          className="text-muted hover:text-ink-2"
        >
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
