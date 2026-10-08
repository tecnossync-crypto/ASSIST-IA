"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { guardarDestinoEmpresaAction } from "@/app/(app)/configuracion/enrutamiento/actions";
import type { DestinoLlamadas } from "@/lib/api";

const OPCIONES: { valor: DestinoLlamadas; titulo: string; descripcion: string }[] = [
  {
    valor: "plataforma",
    titulo: "Digital: en la web de la plataforma",
    descripcion:
      "Suena en el panel de teléfono de los asesores que estén Activos. Les aparece la ventana de llamada entrante con el resumen de lo que habló el cliente con la IA. Si no hay asesores activos, el cliente espera en la cola.",
  },
  {
    valor: "central",
    titulo: "Teléfonos físicos (central)",
    descripcion:
      "La llamada pasa directo a las extensiones de tu central y suena en los teléfonos de escritorio. No se usa la web, así que no hay ventana de resumen. Si la central no está lista, pasa a los asesores digitales activos.",
  },
  {
    valor: "ambos",
    titulo: "Digital primero, teléfonos físicos de respaldo",
    descripcion:
      "Suena en la web de los asesores activos; si nadie contesta a tiempo (o no hay ninguno activo), pasa sola a las extensiones de la central.",
  },
];

/**
 * Dónde se atiende una llamada que la IA transfiere a una persona. Cada
 * departamento puede pisar esta elección (ver más abajo, en Colas).
 *
 * Es un componente controlado a propósito: con radios no controlados dentro
 * de un <form action>, React 19 reinicia el formulario al terminar de
 * guardar y la opción elegida volvía sola a la anterior.
 */
export function DestinoEmpresaForm({ destinoActual }: { destinoActual: DestinoLlamadas }) {
  const [valor, setValor] = useState<DestinoLlamadas>(destinoActual);
  const [resultado, setResultado] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [guardando, startTransition] = useTransition();

  useEffect(() => {
    setValor(destinoActual);
  }, [destinoActual]);

  function cambiar(nuevo: DestinoLlamadas) {
    const anterior = valor;
    setValor(nuevo);
    setResultado(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("destino", nuevo);
      const r = await guardarDestinoEmpresaAction(formData);
      setResultado(r);
      if (r.error) setValor(anterior);
      else setTimeout(() => setResultado(null), 2500);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {OPCIONES.map((o) => (
        <label
          key={o.valor}
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-edge p-3 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50/60 dark:has-[:checked]:bg-indigo-500/10"
        >
          <input
            type="radio"
            name="destino"
            value={o.valor}
            checked={valor === o.valor}
            disabled={guardando}
            onChange={() => cambiar(o.valor)}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-ink">{o.titulo}</span>
            <span className="block text-xs text-muted">{o.descripcion}</span>
          </span>
        </label>
      ))}
      <div className="h-4 text-xs">
        {guardando && (
          <span className="flex items-center gap-1.5 text-muted">
            <Loader2 size={12} className="animate-spin" /> Guardando…
          </span>
        )}
        {resultado?.ok && (
          <span className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 size={12} /> Guardado.
          </span>
        )}
        {resultado?.error && (
          <span className="flex items-center gap-1.5 text-red-600">
            <XCircle size={12} /> {resultado.error}
          </span>
        )}
      </div>
    </div>
  );
}
