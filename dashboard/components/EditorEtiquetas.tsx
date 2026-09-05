"use client";

import { useState } from "react";
import { Plus, Trash2, Tag } from "lucide-react";
import type { EtiquetaDisponible } from "@/lib/api";

const COLORES = [
  { valor: "indigo", clase: "bg-indigo-500" },
  { valor: "emerald", clase: "bg-emerald-500" },
  { valor: "amber", clase: "bg-amber-500" },
  { valor: "rose", clase: "bg-rose-500" },
  { valor: "slate", clase: "bg-slate-500" },
];

export function EditorEtiquetas({ valorInicial }: { valorInicial: EtiquetaDisponible[] }) {
  const [etiquetas, setEtiquetas] = useState<EtiquetaDisponible[]>(valorInicial);

  function agregar() {
    setEtiquetas([...etiquetas, { nombre: "", color: "indigo" }]);
  }

  function quitar(i: number) {
    setEtiquetas(etiquetas.filter((_, idx) => idx !== i));
  }

  function actualizar(i: number, campo: Partial<EtiquetaDisponible>) {
    setEtiquetas(etiquetas.map((e, idx) => (idx === i ? { ...e, ...campo } : e)));
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="etiquetas_disponibles_json" value={JSON.stringify(etiquetas)} />

      {etiquetas.length > 0 && (
        <div className="flex flex-col gap-2">
          {etiquetas.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <Tag size={14} className="text-muted" />
              <input
                value={e.nombre}
                onChange={(ev) => actualizar(i, { nombre: ev.target.value })}
                placeholder="Nombre de la etiqueta (ej: VIP, moroso)"
                className="flex-1 rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div className="flex gap-1">
                {COLORES.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    onClick={() => actualizar(i, { color: c.valor })}
                    className={
                      "h-6 w-6 rounded-full " +
                      c.clase +
                      (e.color === c.valor ? " ring-2 ring-offset-1 ring-slate-400" : "")
                    }
                    aria-label={c.valor}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => quitar(i)}
                className="flex items-center justify-center rounded-md border border-edge px-2.5 text-muted hover:border-red-200 hover:text-red-600"
                aria-label="Quitar etiqueta"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={agregar}
        className="flex w-fit items-center gap-1.5 rounded-md border border-dashed border-edge px-3 py-1.5 text-sm text-ink-2 hover:border-indigo-400 hover:text-indigo-700"
      >
        <Plus size={14} />
        Agregar etiqueta
      </button>

      <p className="text-xs text-muted">
        Catálogo de etiquetas disponibles para organizar contactos (se asignan manualmente o desde un flujo de
        trabajo).
      </p>
    </div>
  );
}
