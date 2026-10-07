"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, XCircle, X, Loader2 } from "lucide-react";
import { OverlayGuardando } from "./OverlayGuardando";

type Aviso = { tipo: "ok" | "error"; texto: string };

/**
 * Envuelve un formulario de Server Action con el mismo comportamiento al
 * guardar en todas las pantallas de Configuración:
 *
 * - Mientras guarda: overlay con spinner que bloquea el formulario (evita
 *   dobles envíos y ediciones a medias) y el botón queda en "Guardando…".
 * - Al terminar: un aviso flotante (abajo a la derecha) que NO tapa nada y se
 *   cierra solo si fue éxito. Si falló, el aviso dice por qué y se queda hasta
 *   cerrarlo; lo escrito en el formulario se conserva para reintentar.
 *
 * El envío se maneja a mano (en vez de `<form action>`) a propósito: React 19
 * reinicia el formulario al terminar una acción, y los campos de texto
 * volvían visualmente al valor anterior aunque ya se hubiera guardado.
 *
 * La acción puede devolver `{ error }` para un mensaje propio; si lanza una
 * excepción se muestra un aviso genérico (en producción Next oculta el
 * mensaje original de las excepciones de Server Actions).
 */
export function FormConFeedback({
  action,
  children,
  submitLabel = "Guardar",
  mensajeExito = "Guardado correctamente.",
  className,
}: {
  action: (formData: FormData) => Promise<void | { error?: string }>;
  children: React.ReactNode;
  submitLabel?: string;
  mensajeExito?: string;
  className?: string;
}) {
  const [guardando, startTransition] = useTransition();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  function mostrar(nuevo: Aviso) {
    if (temporizador.current) clearTimeout(temporizador.current);
    setAviso(nuevo);
    if (nuevo.tipo === "ok") temporizador.current = setTimeout(() => setAviso(null), 3000);
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (guardando) return;
    const formData = new FormData(e.currentTarget);
    setAviso(null);
    startTransition(async () => {
      try {
        const resultado = await action(formData);
        if (resultado && typeof resultado === "object" && resultado.error) {
          mostrar({ tipo: "error", texto: resultado.error });
        } else {
          mostrar({ tipo: "ok", texto: mensajeExito });
        }
      } catch {
        mostrar({ tipo: "error", texto: "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo." });
      }
    });
  }

  return (
    <form onSubmit={enviar} className={`relative ${className ?? ""}`}>
      <OverlayGuardando estado={guardando ? "guardando" : null} />
      {children}
      <div className="mt-4">
        <button
          type="submit"
          disabled={guardando}
          className="ts-brand-button flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 transition-colors disabled:opacity-60"
        >
          {guardando && <Loader2 size={14} className="animate-spin" />}
          {guardando ? "Guardando…" : submitLabel}
        </button>
      </div>

      {aviso && (
        <div
          role={aviso.tipo === "error" ? "alert" : "status"}
          aria-live={aviso.tipo === "error" ? "assertive" : "polite"}
          className={
            "fixed bottom-5 right-5 z-[90] flex max-w-sm items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg " +
            (aviso.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950 dark:text-red-200")
          }
        >
          {aviso.tipo === "ok" ? (
            <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-emerald-500" />
          ) : (
            <XCircle size={18} className="mt-0.5 flex-shrink-0 text-red-500" />
          )}
          <span className="min-w-0 flex-1">{aviso.texto}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
            className="flex-shrink-0 opacity-60 hover:opacity-100"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </form>
  );
}
