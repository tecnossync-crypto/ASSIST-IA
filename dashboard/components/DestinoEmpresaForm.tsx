"use client";

import { useRef } from "react";
import { guardarDestinoEmpresaAction } from "@/app/(app)/configuracion/enrutamiento/actions";
import type { DestinoLlamadas } from "@/lib/api";

const OPCIONES: { valor: DestinoLlamadas; titulo: string; descripcion: string }[] = [
  {
    valor: "plataforma",
    titulo: "En la plataforma",
    descripcion:
      "La llamada la contesta un agente conectado al softphone del dashboard, con el contacto y la conversación de la IA a la vista.",
  },
  {
    valor: "central",
    titulo: "En los teléfonos físicos",
    descripcion:
      "La llamada va directo a las extensiones de tu central y suena en los teléfonos de escritorio. No se usan los agentes de la plataforma.",
  },
  {
    valor: "ambos",
    titulo: "Plataforma primero, teléfonos de respaldo",
    descripcion:
      "Se intenta con los agentes de la plataforma; si no hay ninguno disponible, suenan las extensiones de la central.",
  },
];

/**
 * Dónde se atiende una llamada que la IA transfiere a una persona. Cada
 * departamento puede pisar esta elección (ver más abajo, en Colas).
 */
export function DestinoEmpresaForm({ destinoActual }: { destinoActual: DestinoLlamadas }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={guardarDestinoEmpresaAction} className="flex flex-col gap-2">
      {OPCIONES.map((o) => (
        <label
          key={o.valor}
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-edge p-3 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50/60 dark:has-[:checked]:bg-indigo-500/10"
        >
          <input
            type="radio"
            name="destino"
            value={o.valor}
            defaultChecked={destinoActual === o.valor}
            onChange={() => formRef.current?.requestSubmit()}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-ink">{o.titulo}</span>
            <span className="block text-xs text-muted">{o.descripcion}</span>
          </span>
        </label>
      ))}
    </form>
  );
}
