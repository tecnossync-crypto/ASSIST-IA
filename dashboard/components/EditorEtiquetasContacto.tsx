"use client";

import { useState } from "react";
import { guardarEtiquetasAction } from "@/app/(app)/contactos/[id]/actions";
import { EtiquetaChip } from "./EtiquetaChip";
import { OverlayGuardando } from "./OverlayGuardando";
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
      <p className="text-sm text-muted">
        No hay etiquetas configuradas — agrégalas en Configuración → Campos y etiquetas.
      </p>
    );
  }

  return (
    <div className="relative flex flex-col gap-3">
      <OverlayGuardando estado={guardando ? "guardando" : guardado ? "ok" : null} />
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
      <div>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="ts-brand-button w-fit rounded-md px-3 py-1.5 text-xs font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
        >
          Guardar etiquetas
        </button>
      </div>
    </div>
  );
}
