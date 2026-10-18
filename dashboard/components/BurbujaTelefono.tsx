"use client";

import { useRef } from "react";
import { Phone } from "lucide-react";
import { puenteEscritorio } from "@/lib/escritorio";

/**
 * Teléfono contraído (app de escritorio): una burbuja pegada al borde de la pantalla. Un clic abre el panel
 * (marcar, contactos, recientes, llamadas entrantes…); si se arrastra, se mueve y se pega sola al borde más
 * cercano. Como la burbuja es clicable no puede usar la zona de arrastre del sistema, así que el arrastre se
 * hace a mano con eventos de puntero y se le pide a la app que mueva la ventana.
 */
export function BurbujaTelefono({
  puntoEstado,
  tituloEstado,
  sonando,
  enLlamada,
  cronometro,
  avisos,
  onAbrir,
}: {
  puntoEstado: string;
  tituloEstado: string;
  sonando: boolean;
  enLlamada: boolean;
  cronometro: string;
  avisos: number;
  onAbrir: () => void;
}) {
  const arrastre = useRef<{ sx: number; sy: number; movido: boolean } | null>(null);

  return (
    <div className="flex h-full w-full select-none items-center justify-center">
      <button
        type="button"
        aria-label={sonando ? "Llamada entrante: abrir el teléfono" : "Abrir el teléfono"}
        title={sonando ? "Llamada entrante" : `${tituloEstado} — clic para abrir, arrastra para mover`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          arrastre.current = { sx: e.screenX, sy: e.screenY, movido: false };
          puenteEscritorio()?.arrastreInicio();
        }}
        onPointerMove={(e) => {
          const a = arrastre.current;
          if (!a) return;
          const dx = e.screenX - a.sx;
          const dy = e.screenY - a.sy;
          if (!a.movido && Math.hypot(dx, dy) < 5) return;
          a.movido = true;
          puenteEscritorio()?.arrastreMover(dx, dy);
        }}
        onPointerUp={() => {
          const a = arrastre.current;
          arrastre.current = null;
          if (a?.movido) puenteEscritorio()?.arrastreFin();
          else onAbrir();
        }}
        onPointerCancel={() => {
          if (arrastre.current?.movido) puenteEscritorio()?.arrastreFin();
          arrastre.current = null;
        }}
        className={
          "relative flex h-14 w-14 touch-none flex-col items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95 " +
          (enLlamada
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/40"
            : "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/40")
        }
      >
        {sonando && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />}
        <Phone size={enLlamada ? 17 : 22} className={sonando ? "relative animate-bounce" : "relative"} />
        {enLlamada && <span className="relative text-[10px] font-semibold leading-none tabular-nums">{cronometro}</span>}

        {/* Estado del asesor (disponible / descanso / desconectado) */}
        <span
          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${puntoEstado}`}
        />
        {avisos > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
            {avisos}
          </span>
        )}
      </button>
    </div>
  );
}
