"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import type { EstadoPresencia } from "@/lib/api";

interface OpcionEstado {
  valor: EstadoPresencia;
  etiqueta: string;
  colorPunto: string;
}

const OPCIONES: OpcionEstado[] = [
  { valor: "disponible", etiqueta: "Disponible", colorPunto: "bg-emerald-500" },
  { valor: "descanso", etiqueta: "En descanso", colorPunto: "bg-amber-500" },
  { valor: "desconectado", etiqueta: "No disponible", colorPunto: "bg-slate-400" },
];

// Botón de estado (arriba a la derecha, en todas las páginas): cada usuario
// marca si está disponible, en descanso, o no disponible para recibir
// llamadas ahora mismo. "Disponible" es el único de los tres que deja
// disponible = true en la base — el mismo campo que ya usa toda la regla de
// asignación (round robin, menos llamadas, último operador, etc.), así que
// "descanso" y "no disponible" quedan igual de afuera del reparto; la
// diferencia entre esos dos es solo para que se entienda por qué el agente
// no está tomando llamadas (pausa vs. desconectado del todo).
export function EstadoAgenteBoton({
  usuarioId,
  estadoInicial,
}: {
  usuarioId: string;
  estadoInicial: EstadoPresencia;
}) {
  const [estado, setEstado] = useState<EstadoPresencia>(estadoInicial);
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

  async function elegir(valor: EstadoPresencia) {
    setAbierto(false);
    if (valor === estado) return;
    const anterior = estado;
    setEstado(valor);
    setCargando(true);
    try {
      const res = await fetch("/api/agentes/presencia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usuarioId, estado: valor }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEstado(anterior); // revertir si el backend no confirmó
    } finally {
      setCargando(false);
    }
  }

  const actual = OPCIONES.find((o) => o.valor === estado) ?? OPCIONES[2];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 shadow-sm hover:border-edge"
      >
        {cargando ? (
          <Loader2 size={10} className="animate-spin text-muted" />
        ) : (
          <span className={`h-2 w-2 rounded-full ${actual.colorPunto}`} />
        )}
        {actual.etiqueta}
        <ChevronDown size={13} className="text-muted" />
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-1.5 w-44 overflow-hidden rounded-lg border border-edge bg-surface py-1 shadow-lg">
          {OPCIONES.map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => elegir(o.valor)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink-2 hover:bg-surface-2"
            >
              <span className={`h-2 w-2 rounded-full ${o.colorPunto}`} />
              {o.etiqueta}
              {o.valor === estado && <span className="ml-auto text-indigo-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
