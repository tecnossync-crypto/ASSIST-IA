"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { guardarEtiquetasAction } from "@/app/contactos/[id]/actions";
import { EtiquetaChip } from "./EtiquetaChip";
import type { EtiquetaDisponible } from "@/lib/api";

export function EditorEtiquetasContacto({
  contactoId,
  catalogo,
  valorInicial,
}: {
  contactoId: string;
  catalogo: EtiquetaDisponible[];
  valorInicial: string[];
}) {
  const [seleccionadas, setSeleccionadas] = useState<string[]>(valorInicial);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  function toggle(nombre: string) {
    setSeleccionadas((prev) => (prev.includes(nombre) ? prev.filter((n) => n !== nombre) : [...prev, nombre]));
    setGuardado(false);
  }

  async function guardar() {
    setGuardando(true);
    const formData = new FormData();
    formData.set("contactoId", contactoId);
    formData.set("etiquetas_json", JSON.stringify(seleccionadas));
    await guardarEtiquetasAction(formData);
    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  }

  if (catalogo.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No hay etiquetas configuradas — agrégalas en Configuración → Campos y etiquetas.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {catalogo.map((et) => {
          const activa = seleccionadas.includes(et.nombre);
          return (
            <button
              key={et.nombre}
              type="button"
              onClick={() => toggle(et.nombre)}
              className={activa ? "" : "opacity-40 grayscale"}
            >
              <EtiquetaChip nombre={et.nombre} color={et.color} />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="ts-brand-button w-fit rounded-md px-3 py-1.5 text-xs font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar etiquetas"}
        </button>
        {guardando && (
          <span className="flex items-center gap-1 text-xs text-indigo-600">
            <Loader2 size={12} className="animate-spin" /> Aplicando…
          </span>
        )}
        {!guardando && guardado && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 size={12} /> Guardado correctamente.
          </span>
        )}
      </div>
    </div>
  );
}
