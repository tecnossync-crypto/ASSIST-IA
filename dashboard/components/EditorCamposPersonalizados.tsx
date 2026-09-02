"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CampoPersonalizado } from "@/lib/api";

/**
 * Editor tipo tabla para los campos que la empresa quiere que el bot
 * recolecte. Serializa a un input hidden con JSON, que actions.ts parsea
 * directo (sin el formato "nombre: descripción" por línea de antes).
 */
export function EditorCamposPersonalizados({ valorInicial }: { valorInicial: CampoPersonalizado[] }) {
  const [campos, setCampos] = useState<CampoPersonalizado[]>(
    valorInicial.length > 0 ? valorInicial : []
  );

  function agregar() {
    setCampos([...campos, { nombre: "", descripcion: "" }]);
  }

  function quitar(i: number) {
    setCampos(campos.filter((_, idx) => idx !== i));
  }

  function actualizar(i: number, campo: Partial<CampoPersonalizado>) {
    setCampos(campos.map((c, idx) => (idx === i ? { ...c, ...campo } : c)));
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="campos_personalizados_json" value={JSON.stringify(campos)} />

      {campos.length > 0 && (
        <div className="flex flex-col gap-2">
          {campos.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={c.nombre}
                onChange={(e) => actualizar(i, { nombre: e.target.value })}
                placeholder="Nombre del campo (ej: número de póliza)"
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <input
                value={c.descripcion ?? ""}
                onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                placeholder="Descripción / cómo pedirlo (opcional)"
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => quitar(i)}
                className="flex items-center justify-center rounded-md border border-slate-200 px-2.5 text-slate-400 hover:border-red-200 hover:text-red-600"
                aria-label="Quitar campo"
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
        className="flex w-fit items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
      >
        <Plus size={14} />
        Agregar campo
      </button>

      <p className="text-xs text-slate-400">
        El agente pedirá estos datos durante la llamada y quedarán guardados en el perfil de cada contacto.
      </p>
    </div>
  );
}
