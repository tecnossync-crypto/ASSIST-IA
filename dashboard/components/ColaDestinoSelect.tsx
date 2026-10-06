"use client";

import { guardarDestinoColaAction } from "@/app/(app)/configuracion/enrutamiento/actions";
import type { DestinoLlamadas } from "@/lib/api";

// "" = sin destino propio: usa el de la empresa.
export function ColaDestinoSelect({ colaId, destinoActual }: { colaId: string; destinoActual: DestinoLlamadas | null }) {
  return (
    <form action={guardarDestinoColaAction} title="Dónde se atienden las llamadas transferidas a este departamento">
      <input type="hidden" name="id" value={colaId} />
      <select
        name="destino"
        defaultValue={destinoActual ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-edge px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">Usar el de la empresa</option>
        <option value="plataforma">Plataforma</option>
        <option value="central">Teléfonos físicos</option>
        <option value="ambos">Plataforma + respaldo</option>
      </select>
    </form>
  );
}
