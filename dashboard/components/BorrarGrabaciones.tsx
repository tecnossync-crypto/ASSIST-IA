"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2, Trash2 } from "lucide-react";
import { borrarTodasGrabacionesAction } from "@/app/(app)/configuracion/almacenamiento/actions";

const PALABRA = "BORRAR";

/**
 * Borrado masivo de grabaciones (solo el audio; las llamadas, transcripciones
 * y resúmenes se conservan). Pide escribir BORRAR para confirmar, y ofrece
 * descargar el .zip antes porque no se puede deshacer.
 */
export function BorrarGrabaciones({ total }: { total: number }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<{ borradas: number; pendientes: number } | null>(null);

  useEffect(() => {
    if (!abierto) return;
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape" && !borrando) cerrar();
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto, borrando]);

  function cerrar() {
    setAbierto(false);
    setTexto("");
    setError("");
  }

  async function confirmar() {
    setBorrando(true);
    setError("");
    const r = await borrarTodasGrabacionesAction();
    setBorrando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setResultado({ borradas: r.borradas ?? 0, pendientes: r.pendientes ?? 0 });
    cerrar();
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-500/30 dark:bg-red-500/5">
      <p className="mb-1 text-sm font-medium text-red-700 dark:text-red-300">Borrar todas las grabaciones</p>
      <p className="mb-3 text-xs text-muted">
        Elimina el audio de todas las llamadas grabadas. Las llamadas, transcripciones y resúmenes se conservan.
        Descarga el .zip antes: no se puede deshacer.
      </p>

      {resultado && (
        <p className="mb-3 rounded-md bg-emerald-50 px-2.5 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Se borraron {resultado.borradas} grabaciones.
          {resultado.pendientes > 0 && ` ${resultado.pendientes} no se pudieron borrar; vuelve a intentarlo.`}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setResultado(null);
          setAbierto(true);
        }}
        disabled={total === 0}
        className="flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent"
      >
        <Trash2 size={13} />
        {total === 0 ? "No hay grabaciones" : `Borrar ${total} grabaciones`}
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !borrando && cerrar()}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-edge bg-surface p-5 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15">
                <AlertTriangle size={18} />
              </span>
              <div className="min-w-0 flex-1 text-sm text-ink-2">
                <h2 className="text-base font-semibold text-ink">Borrar todas las grabaciones</h2>
                <p className="mt-2">
                  Se eliminará el audio de <strong>{total} grabaciones</strong>. Las llamadas y sus transcripciones se
                  conservan.
                </p>
                <p className="mt-2 rounded-md bg-red-50 px-2.5 py-2 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  Advertencia: esta acción es permanente. Una vez eliminadas, no se pueden recuperar.
                </p>
                <a
                  href="/api/grabaciones/exportar"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline"
                >
                  <Download size={13} /> Descargar todo en .zip antes de borrar
                </a>
                <label htmlFor="confirmar-borrado" className="mt-3 block text-xs text-muted">
                  Para confirmar escribe <strong>{PALABRA}</strong>
                </label>
                <input
                  id="confirmar-borrado"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cerrar}
                disabled={borrando}
                className="rounded-md border border-edge px-4 py-2 text-sm text-ink-2 hover:bg-surface-2 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={texto.trim().toUpperCase() !== PALABRA || borrando}
                className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {borrando && <Loader2 size={14} className="animate-spin" />}
                {borrando ? "Borrando…" : "Borrar todo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
