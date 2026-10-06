"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Database, Eraser } from "lucide-react";
import type { ElementoHuerfano } from "@/lib/api";
import { EliminarCatalogoModal } from "./EliminarCatalogoModal";

type Seleccion = { tipo: "etiqueta" | "campo"; nombre: string };

/**
 * Etiquetas y campos que quedaron guardados en contactos pero ya no existen
 * en la configuración (por ejemplo, borrados antes de que eliminar una
 * etiqueta o un campo limpiara también los contactos). Siguen apareciendo en
 * la ficha de esos contactos hasta que se quitan acá, con la misma
 * confirmación que muestra cuántos contactos afecta.
 */
export function DatosHuerfanos({
  etiquetas,
  campos,
}: {
  etiquetas: ElementoHuerfano[];
  campos: ElementoHuerfano[];
}) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);

  if (etiquetas.length === 0 && campos.length === 0) return null;

  function fila(tipo: Seleccion["tipo"], e: ElementoHuerfano) {
    const Icono = tipo === "etiqueta" ? Tag : Database;
    return (
      <div key={`${tipo}-${e.nombre}`} className="flex items-center justify-between gap-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icono size={14} className="flex-shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{e.nombre}</p>
            <p className="text-xs text-muted">
              {tipo === "etiqueta" ? "Etiqueta" : "Campo"} en {e.contactos} {e.contactos === 1 ? "contacto" : "contactos"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSeleccion({ tipo, nombre: e.nombre })}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-red-200 hover:text-red-600"
        >
          <Eraser size={13} />
          Quitar de los contactos
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-5 dark:bg-amber-500/5">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        <Eraser size={16} className="text-amber-600" />
        Datos que ya no están en la configuración
      </div>
      <p className="mb-3 text-xs text-muted">
        Estas etiquetas y campos ya no existen aquí, pero siguen guardados en algunos contactos y por eso todavía se
        ven en su ficha. Quítalos para limpiarlos de todos lados.
      </p>
      <div className="flex flex-col divide-y divide-amber-200/70">
        {etiquetas.map((e) => fila("etiqueta", e))}
        {campos.map((c) => fila("campo", c))}
      </div>

      {seleccion && (
        <EliminarCatalogoModal
          tipo={seleccion.tipo}
          nombre={seleccion.nombre}
          onCerrar={() => setSeleccion(null)}
          onEliminado={() => {
            setSeleccion(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
