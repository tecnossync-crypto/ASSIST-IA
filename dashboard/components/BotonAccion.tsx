"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

/**
 * Botón para acciones puntuales (eliminar, activar, pausar...) que llaman
 * directo a una Server Action — sin esto, el clic no daba ninguna señal
 * hasta que la página revalidaba sola. Ahora: círculo girando mientras
 * corre, y un mensaje de confirmación (o error) al terminar — mismo
 * estándar en toda la plataforma para que se sienta una app seria, no que
 * "tal vez funcionó".
 */
export function BotonAccion({
  accion,
  children,
  mensajeExito = "Listo.",
  mensajeConfirmar,
  className = "text-xs text-red-600 hover:underline",
  claseCargando,
}: {
  accion: () => Promise<void>;
  children: React.ReactNode;
  mensajeExito?: string;
  /** Si se define, pide confirmación (window.confirm) antes de ejecutar — para acciones destructivas. */
  mensajeConfirmar?: string;
  className?: string;
  /** Clase aplicada mientras carga (por si el botón normal es de otro color, ej. blanco sobre fondo oscuro). */
  claseCargando?: string;
}) {
  const [estado, setEstado] = useState<"idle" | "cargando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  async function manejarClick() {
    if (mensajeConfirmar && !window.confirm(mensajeConfirmar)) return;

    setEstado("cargando");
    try {
      await accion();
      setEstado("ok");
      setMensaje(mensajeExito);
      setTimeout(() => setEstado("idle"), 2000);
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "No se pudo completar.");
      setTimeout(() => setEstado("idle"), 2500);
    }
  }

  if (estado === "cargando") {
    return (
      <span className={`inline-flex items-center gap-1.5 ${claseCargando ?? className}`}>
        <Loader2 size={12} className="animate-spin" />
        Aplicando…
      </span>
    );
  }

  if (estado === "ok") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
        <CheckCircle2 size={12} />
        {mensaje}
      </span>
    );
  }

  if (estado === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-600" title={mensaje}>
        <XCircle size={12} />
        Error
      </span>
    );
  }

  return (
    <button type="button" onClick={manejarClick} className={className}>
      {children}
    </button>
  );
}
