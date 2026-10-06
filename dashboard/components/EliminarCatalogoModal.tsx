"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, XCircle } from "lucide-react";
import {
  eliminarCatalogoAction,
  obtenerImpactoCatalogoAction,
  type ResultadoImpacto,
  type TipoCatalogo,
} from "@/app/(app)/configuracion/contactos/actions";

/**
 * Confirmación para eliminar una etiqueta o un campo personalizado del
 * catálogo. Antes de confirmar calcula a cuántos contactos afecta (y, en
 * etiquetas, qué flujos de trabajo quedarán desactivados), para que quien
 * borra sepa exactamente qué va a pasar. La eliminación es inmediata y
 * limpia el dato de todos los contactos; los contactos se conservan.
 */
export function EliminarCatalogoModal({
  tipo,
  nombre,
  onEliminado,
  onCerrar,
}: {
  tipo: TipoCatalogo;
  nombre: string;
  onEliminado: () => void;
  onCerrar: () => void;
}) {
  const [impacto, setImpacto] = useState<ResultadoImpacto | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");
  const botonCancelar = useRef<HTMLButtonElement>(null);

  const esEtiqueta = tipo === "etiqueta";
  const titulo = esEtiqueta ? `Eliminar la etiqueta "${nombre}"` : `Eliminar el campo "${nombre}"`;

  useEffect(() => {
    let cancelado = false;
    obtenerImpactoCatalogoAction(tipo, nombre).then((r) => {
      if (!cancelado) setImpacto(r);
    });
    return () => {
      cancelado = true;
    };
  }, [tipo, nombre]);

  useEffect(() => {
    botonCancelar.current?.focus();
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape" && !eliminando) onCerrar();
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [eliminando, onCerrar]);

  async function confirmar() {
    setEliminando(true);
    setError("");
    const r = await eliminarCatalogoAction(tipo, nombre);
    if (r.error) {
      setError(r.error);
      setEliminando(false);
      return;
    }
    onEliminado();
  }

  const cargando = impacto === null;
  const fallo = impacto?.error;
  const contactos = impacto?.contactos ?? 0;
  const flujos = impacto?.flujos ?? [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={() => !eliminando && onCerrar()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-eliminar-titulo"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-edge bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="modal-eliminar-titulo" className="text-base font-semibold text-ink">
              {titulo}
            </h2>

            <div className="mt-2 flex flex-col gap-2 text-sm text-ink-2">
              {cargando && (
                <p className="flex items-center gap-2 text-muted">
                  <Loader2 size={14} className="animate-spin" /> Calculando a cuántos contactos afecta…
                </p>
              )}

              {fallo && <p className="text-red-600">No se pudo calcular el impacto: {fallo}</p>}

              {!cargando && !fallo && (
                <>
                  <p>
                    {esEtiqueta ? "Se quitará de " : "Se borrará el dato de "}
                    <strong>
                      {contactos} {contactos === 1 ? "contacto" : "contactos"}
                    </strong>
                    {esEtiqueta ? " que la tienen" : " que lo tienen"}, y desaparecerá de la configuración. Los
                    contactos se conservan con el resto de su información.
                  </p>

                  {esEtiqueta && flujos.length > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                      <p className="font-medium">
                        {flujos.length === 1 ? "Este flujo de trabajo usa" : "Estos flujos de trabajo usan"} esta
                        etiqueta y quedará{flujos.length === 1 ? "" : "n"} desactivado{flujos.length === 1 ? "" : "s"}:
                      </p>
                      <ul className="mt-1 list-disc pl-4">
                        {flujos.map((f) => (
                          <li key={f.id}>{f.nombre}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!esEtiqueta && (
                    <p className="text-xs text-muted">
                      Lo que la IA capturó con este campo en llamadas ya hechas se conserva en el historial de esas
                      llamadas.
                    </p>
                  )}

                  <p className="text-xs font-medium text-red-600">Esta acción no se puede deshacer.</p>
                </>
              )}

              {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <XCircle size={13} /> {error}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={botonCancelar}
            type="button"
            onClick={onCerrar}
            disabled={eliminando}
            className="rounded-md border border-edge px-4 py-2 text-sm text-ink-2 hover:bg-surface-2 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={cargando || !!fallo || eliminando}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {eliminando && <Loader2 size={14} className="animate-spin" />}
            {eliminando ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
