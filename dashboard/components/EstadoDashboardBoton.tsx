"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { OPCIONES_ESTADO, opcionDeEstado, usePresencia } from "@/components/estado-asesor";

// Botón de estado de la barra de arriba (todas las páginas): Activo / En pausa /
// Inactivo. Comparte el mismo estado que el selector del panel de teléfono (los
// dos leen y escriben lo mismo y se refrescan solos), así que cambiar uno se
// ve en el otro. Solo "Activo" recibe llamadas.
export function EstadoDashboardBoton({ usuarioId }: { usuarioId: string }) {
  const { estado, cargando, error, cambiar } = usePresencia(usuarioId);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function cerrarSiFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", cerrarSiFuera);
    return () => document.removeEventListener("mousedown", cerrarSiFuera);
  }, []);

  if (!estado) return null;
  const actual = opcionDeEstado(estado);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 shadow-sm hover:bg-surface-2"
      >
        {cargando ? <Loader2 size={10} className="animate-spin text-muted" /> : <span className={`h-2 w-2 rounded-full ${actual.punto}`} />}
        {actual.etiqueta}
        <ChevronDown size={13} className="text-muted" />
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-edge bg-surface py-1 shadow-lg">
          {OPCIONES_ESTADO.map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => {
                setAbierto(false);
                cambiar(o.valor);
              }}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
            >
              <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${o.punto}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-ink">{o.etiqueta}</span>
                <span className="block text-[11px] text-muted">{o.descripcion}</span>
              </span>
              {o.valor === estado && <span className="text-indigo-600">✓</span>}
            </button>
          ))}
          {error && <p className="px-3 py-1.5 text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
