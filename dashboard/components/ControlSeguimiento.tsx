"use client";

import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, Loader2, Pencil, Sparkles } from "lucide-react";
import { guardarSeguimientoAction } from "@/app/(app)/seguimiento/actions";
import { formatFechaHora } from "@/lib/format";

const CAMPO =
  "rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50";

function aInputLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Hoy + N días a la hora indicada, en formato de <input type="datetime-local">. */
function enDias(dias: number, hora: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return aInputLocal(d.toISOString());
}

/** Programar / confirmar / cambiar / cerrar el seguimiento de un cliente (cuándo volver a contactarlo). */
export function ControlSeguimiento({
  contactoId,
  estado,
  fecha: fechaActual,
  nota: notaActual,
  origen,
  accionPendiente,
}: {
  contactoId: string;
  estado: "pendiente" | "hecho" | null;
  fecha: string | null;
  nota: string | null;
  origen: "ia" | "vendedor" | null;
  accionPendiente: string | null;
}) {
  const pendiente = estado === "pendiente";
  const hecho = estado === "hecho";
  const vencido = pendiente && fechaActual !== null && new Date(fechaActual) <= new Date();
  const propuestaIA = pendiente && origen === "ia";

  const [editando, setEditando] = useState(false);
  const [fecha, setFecha] = useState(aInputLocal(fechaActual) || enDias(1, 10));
  const [nota, setNota] = useState(notaActual ?? accionPendiente ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enCurso, iniciar] = useTransition();

  function enviar(datos: Parameters<typeof guardarSeguimientoAction>[1]) {
    setError(null);
    iniciar(async () => {
      const r = await guardarSeguimientoAction(contactoId, datos);
      if (r.error) setError(r.error);
      else setEditando(false);
    });
  }

  const tono = vencido
    ? "border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10"
    : propuestaIA
      ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/10"
      : "border-edge bg-surface";

  return (
    <section className={`rounded-xl border p-3 ${tono}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          {hecho ? <CheckCircle2 size={15} className="text-emerald-600" /> : <CalendarClock size={15} className="text-indigo-600" />}
          {pendiente && fechaActual ? (
            <span>
              {vencido ? "Vencido · " : "Volver a contactarlo · "}
              {formatFechaHora(fechaActual)}
            </span>
          ) : hecho ? (
            <span>Ya se le dio seguimiento</span>
          ) : (
            <span>Sin seguimiento programado</span>
          )}
        </div>
        {propuestaIA && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
            <Sparkles size={11} />
            Propuesto por la IA
          </span>
        )}
      </div>

      {notaActual && !editando && <p className="mt-1.5 text-xs text-ink-2">{notaActual}</p>}
      {propuestaIA && !editando && (
        <p className="mt-1 text-[11px] text-muted">El cliente pidió que lo vuelvan a llamar. Confirma la fecha o cámbiala.</p>
      )}

      {editando ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" className={CAMPO} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            {[
              ["Hoy 4pm", enDias(0, 16)],
              ["Mañana", enDias(1, 10)],
              ["En 3 días", enDias(3, 10)],
              ["1 semana", enDias(7, 10)],
            ].map(([etiqueta, valor]) => (
              <button
                key={etiqueta}
                type="button"
                onClick={() => setFecha(valor)}
                className="rounded-full border border-edge px-2.5 py-0.5 text-xs text-ink-2 hover:border-indigo-300"
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <textarea
            className={CAMPO + " w-full"}
            rows={2}
            maxLength={2000}
            placeholder="Nota para recordar de qué hablar (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={enCurso || !fecha}
              onClick={() => enviar({ estado: "pendiente", fecha: new Date(fecha).toISOString(), nota })}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {enCurso && <Loader2 size={14} className="animate-spin" />}
              Guardar
            </button>
            <button type="button" onClick={() => setEditando(false)} className="text-xs text-muted hover:underline">
              Cancelar
            </button>
            {pendiente && (
              <button type="button" disabled={enCurso} onClick={() => enviar({ estado: null })} className="ml-auto text-xs text-red-600 hover:underline">
                Quitar seguimiento
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {propuestaIA && fechaActual && (
            <button
              type="button"
              disabled={enCurso}
              onClick={() => enviar({ estado: "pendiente", fecha: fechaActual, nota: notaActual })}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {enCurso ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Confirmar fecha
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-indigo-300"
          >
            {pendiente ? <Pencil size={12} /> : <CalendarClock size={12} />}
            {pendiente ? "Cambiar fecha" : "Programar seguimiento"}
          </button>
          {pendiente && (
            <button
              type="button"
              disabled={enCurso}
              onClick={() => enviar({ estado: "hecho" })}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-surface px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
            >
              {enCurso ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Marcar como contactado
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
