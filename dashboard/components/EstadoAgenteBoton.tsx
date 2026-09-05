"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

interface OpcionEstado {
  valor: boolean;
  etiqueta: string;
  colorPunto: string;
}

const OPCIONES: OpcionEstado[] = [
  { valor: true, etiqueta: "Disponible", colorPunto: "bg-emerald-500" },
  { valor: false, etiqueta: "No disponible", colorPunto: "bg-slate-400" },
];

// Botón de estado (arriba a la derecha, en todas las páginas): cada usuario
// marca si está disponible para recibir llamadas ahora mismo. Es el mismo
// campo `disponible` que ya usa toda la regla de asignación (round robin,
// menos llamadas, último operador, etc.) — así que cambiarlo aquí afecta de
// inmediato a quién le pueden tocar las próximas llamadas.
export function EstadoAgenteBoton({
  usuarioId,
  disponibleInicial,
}: {
  usuarioId: string;
  disponibleInicial: boolean;
}) {
  const [disponible, setDisponible] = useState(disponibleInicial);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function cerrarSiFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", cerrarSiFuera);
    return () => document.removeEventListener("mousedown", cerrarSiFuera);
  }, []);

  async function elegir(valor: boolean) {
    setAbierto(false);
    if (valor === disponible) return;
    const anterior = disponible;
    setDisponible(valor);
    setCargando(true);
    try {
      const res = await fetch("/api/agentes/presencia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usuarioId, disponible: valor }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDisponible(anterior); // revertir si el backend no confirmó
    } finally {
      setCargando(false);
    }
  }

  const actual = OPCIONES.find((o) => o.valor === disponible) ?? OPCIONES[1];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300"
      >
        {cargando ? (
          <Loader2 size={10} className="animate-spin text-slate-400" />
        ) : (
          <span className={`h-2 w-2 rounded-full ${actual.colorPunto}`} />
        )}
        {actual.etiqueta}
        <ChevronDown size={13} className="text-slate-400" />
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-1.5 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {OPCIONES.map((o) => (
            <button
              key={String(o.valor)}
              type="button"
              onClick={() => elegir(o.valor)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              <span className={`h-2 w-2 rounded-full ${o.colorPunto}`} />
              {o.etiqueta}
              {o.valor === disponible && <span className="ml-auto text-indigo-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
