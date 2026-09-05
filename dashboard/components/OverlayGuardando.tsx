"use client";

import { Loader2, CheckCircle2, XCircle } from "lucide-react";

/**
 * Overlay bloqueante de "procesando cambio" — como la pantalla que muestra
 * un banco mientras confirma una transacción: tapa la pantalla (o el
 * contenedor donde se monta), no deja tocar nada por debajo, y muestra
 * spinner → check verde / error, en vez de solo un texto chiquito al lado
 * de un botón. Se usa dentro de un ancestro con `position: relative` para
 * quedar acotado a ese bloque (ej. una tarjeta o modal); si se monta suelto
 * en la página, cubre toda la pantalla.
 */
export function OverlayGuardando({
  estado,
  mensajeGuardando = "Guardando cambios…",
  mensajeExito = "Guardado correctamente.",
  mensajeError = "No se pudo guardar.",
}: {
  estado: "guardando" | "ok" | "error" | null;
  mensajeGuardando?: string;
  mensajeExito?: string;
  mensajeError?: string;
}) {
  if (!estado) return null;

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center rounded-[inherit] bg-white/85 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 px-6 py-5 text-center">
        {estado === "guardando" && (
          <>
            <Loader2 size={28} className="animate-spin text-indigo-600" />
            <p className="text-sm font-medium text-slate-700">{mensajeGuardando}</p>
            <p className="text-xs text-slate-400">Un momento, no cierres esta ventana.</p>
          </>
        )}
        {estado === "ok" && (
          <>
            <CheckCircle2 size={28} className="text-emerald-500" />
            <p className="text-sm font-medium text-emerald-700">{mensajeExito}</p>
          </>
        )}
        {estado === "error" && (
          <>
            <XCircle size={28} className="text-red-500" />
            <p className="text-sm font-medium text-red-700">{mensajeError}</p>
          </>
        )}
      </div>
    </div>
  );
}
