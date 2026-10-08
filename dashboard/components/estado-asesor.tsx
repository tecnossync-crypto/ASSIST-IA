"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { EstadoPresencia } from "@/lib/api";

export interface OpcionEstadoAsesor {
  valor: EstadoPresencia;
  etiqueta: string;
  descripcion: string;
  /** Clases del punto/anillo de color. */
  punto: string;
  /** Clases del botón cuando está elegido. */
  activo: string;
}

// "Activo" es el único que deja al asesor disponible para el reparto de
// llamadas (disponible = true en la base); "En pausa" e "Inactivo" quedan
// igual de fuera, la diferencia es solo para que se entienda por qué no toma
// llamadas (una pausa corta vs. fuera de turno).
export const OPCIONES_ESTADO: OpcionEstadoAsesor[] = [
  {
    valor: "disponible",
    etiqueta: "Activo",
    descripcion: "Recibes llamadas",
    punto: "bg-emerald-500",
    activo: "bg-emerald-500 text-white shadow-emerald-500/30",
  },
  {
    valor: "descanso",
    etiqueta: "En pausa",
    descripcion: "Fuera del reparto, de vuelta pronto",
    punto: "bg-amber-500",
    activo: "bg-amber-500 text-white shadow-amber-500/30",
  },
  {
    valor: "desconectado",
    etiqueta: "Inactivo",
    descripcion: "No recibes llamadas",
    punto: "bg-slate-400",
    activo: "bg-slate-500 text-white shadow-slate-500/30",
  },
];

export function opcionDeEstado(estado: EstadoPresencia | null): OpcionEstadoAsesor {
  return OPCIONES_ESTADO.find((o) => o.valor === estado) ?? OPCIONES_ESTADO[2];
}

/**
 * Estado de presencia de un asesor: lo lee al montar, lo refresca cada pocos
 * segundos (por si se cambió desde el botón de la barra de arriba) y lo
 * cambia con un POST a /api/agentes/presencia, revirtiendo si falla.
 */
export function usePresencia(usuarioId: string | undefined) {
  const [estado, setEstado] = useState<EstadoPresencia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  // Mientras se guarda un cambio no se pisa con la lectura periódica.
  const guardando = useRef(false);

  useEffect(() => {
    if (!usuarioId) {
      setEstado(null);
      return;
    }
    let cancelado = false;
    async function leer() {
      if (guardando.current) return;
      try {
        const res = await fetch(`/api/agentes/${usuarioId}`, { cache: "no-store" });
        if (!res.ok || cancelado || guardando.current) return;
        const data = await res.json();
        if (data?.agente?.estado_presencia) setEstado(data.agente.estado_presencia);
      } catch {
        // silencioso: se reintenta en el próximo tick
      }
    }
    leer();
    const intervalo = setInterval(leer, 10_000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [usuarioId]);

  // Latido: mientras estoy Activo o En pausa aviso cada 30 s que sigo con el
  // panel abierto. Si dejan de llegar (cerré el navegador), el servidor me pasa
  // solo a Inactivo y no me reparte llamadas que no iba a contestar.
  useEffect(() => {
    if (!usuarioId || !estado || estado === "desconectado") return;
    const enviar = () => fetch("/api/agentes/latido", { method: "POST" }).catch(() => {});
    enviar();
    const intervalo = setInterval(enviar, 30_000);
    return () => clearInterval(intervalo);
  }, [usuarioId, estado]);

  const cambiar = useCallback(
    async (nuevo: EstadoPresencia) => {
      if (!usuarioId || nuevo === estado) return;
      const anterior = estado;
      setEstado(nuevo);
      setError("");
      setCargando(true);
      guardando.current = true;
      try {
        const res = await fetch("/api/agentes/presencia", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ usuarioId, estado: nuevo }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setEstado(anterior);
        setError("No se pudo cambiar el estado.");
      } finally {
        guardando.current = false;
        setCargando(false);
      }
    },
    [usuarioId, estado]
  );

  return { estado, cargando, error, cambiar };
}

/** Llamadas atendidas y tiempo hablado hoy (se refresca solo y al terminar una llamada). */
export function useActividadHoy(usuarioId: string | undefined, refrescarAl: unknown) {
  const [datos, setDatos] = useState<{ llamadas: number; segundos: number } | null>(null);

  useEffect(() => {
    if (!usuarioId) {
      setDatos(null);
      return;
    }
    let cancelado = false;
    async function leer() {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await fetch(`/api/agentes/${usuarioId}/hoy?tz=${encodeURIComponent(tz ?? "")}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelado) return;
        const data = await res.json();
        if (!cancelado) setDatos({ llamadas: data.llamadas ?? 0, segundos: data.segundos ?? 0 });
      } catch {
        // silencioso
      }
    }
    leer();
    const intervalo = setInterval(leer, 60_000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [usuarioId, refrescarAl]);

  return datos;
}

/** Control de 3 botones para cambiar de estado de un toque. */
export function SelectorEstadoAsesor({
  estado,
  cargando,
  error,
  onCambiar,
}: {
  estado: EstadoPresencia | null;
  cargando: boolean;
  error: string;
  onCambiar: (e: EstadoPresencia) => void;
}) {
  return (
    <div>
      <div className="flex gap-1 rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Mi estado">
        {OPCIONES_ESTADO.map((o) => {
          const elegido = o.valor === estado;
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={elegido}
              onClick={() => onCambiar(o.valor)}
              title={o.descripcion}
              className={
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-[11px] font-medium transition-all " +
                (elegido ? `${o.activo} shadow` : "text-slate-300 hover:bg-white/10 hover:text-white")
              }
            >
              {elegido && cargando ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <span className={`h-1.5 w-1.5 rounded-full ${elegido ? "bg-white" : o.punto}`} />
              )}
              {o.etiqueta}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
