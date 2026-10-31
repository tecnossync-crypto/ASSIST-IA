"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Loader2, Lightbulb, Phone, Pencil } from "lucide-react";
import type { ClienteSeguimiento } from "@/lib/api";
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

/** Fecha local de hoy + N días a la hora indicada, en formato de <input type="datetime-local">. */
function enDias(dias: number, hora: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return aInputLocal(d.toISOString());
}

const ETIQUETA_SATISFACCION: Record<string, string> = { positiva: "Buen ánimo", neutral: "Neutral", negativa: "Molesto" };

export function TarjetaSeguimiento({ c, mostrarVendedor }: { c: ClienteSeguimiento; mostrarVendedor: boolean }) {
  const nombre = [c.nombre, c.apellido].filter(Boolean).join(" ") || c.numero;
  const pendiente = c.seguimiento_estado === "pendiente";
  const hecho = c.seguimiento_estado === "hecho";
  const vencido = pendiente && c.seguimiento_fecha !== null && new Date(c.seguimiento_fecha) <= new Date();

  const [editando, setEditando] = useState(false);
  const [fecha, setFecha] = useState(aInputLocal(c.seguimiento_fecha) || enDias(1, 10));
  const [nota, setNota] = useState(c.seguimiento_nota ?? c.accion_pendiente ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enCurso, iniciar] = useTransition();

  function enviar(datos: Parameters<typeof guardarSeguimientoAction>[1]) {
    setError(null);
    iniciar(async () => {
      const r = await guardarSeguimientoAction(c.id, datos);
      if (r.error) setError(r.error);
      else setEditando(false);
    });
  }

  const necesidad = c.resumen_solicitud || c.resumen_motivo;

  return (
    <article
      className={
        "rounded-xl border bg-surface p-4 shadow-sm " +
        (vencido ? "border-red-300 dark:border-red-500/40" : "border-edge")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/contactos/${c.id}`} className="text-sm font-semibold text-ink hover:text-indigo-600 hover:underline">
            {nombre}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Phone size={11} />
              {c.numero}
            </span>
            <span>
              {Number(c.total_llamadas)} {Number(c.total_llamadas) === 1 ? "llamada" : "llamadas"} · última{" "}
              {formatFechaHora(c.ultima_llamada_en)}
            </span>
            {mostrarVendedor && <span>Vendedor: {c.propietario_nombre ?? "sin asignar"}</span>}
            {c.satisfaccion && ETIQUETA_SATISFACCION[c.satisfaccion] && <span>{ETIQUETA_SATISFACCION[c.satisfaccion]}</span>}
          </div>
        </div>
        {pendiente && c.seguimiento_fecha && (
          <span
            className={
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium " +
              (vencido
                ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                : "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300")
            }
          >
            <CalendarClock size={12} />
            {vencido ? "Vencido · " : ""}
            {formatFechaHora(c.seguimiento_fecha)}
          </span>
        )}
        {hecho && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 size={12} />
            Contactado
          </span>
        )}
      </div>

      {(necesidad || c.resumen_resultado) && (
        <div className="mt-3 space-y-1 text-sm">
          {necesidad && (
            <p>
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Necesita · </span>
              {necesidad}
            </p>
          )}
          {c.resumen_resultado && (
            <p>
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Resultado · </span>
              {c.resumen_resultado}
            </p>
          )}
        </div>
      )}

      {c.accion_pendiente && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <Lightbulb size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>Pendiente según la IA:</strong> {c.accion_pendiente}
          </span>
        </p>
      )}

      {c.seguimiento_nota && !editando && (
        <p className="mt-2 text-xs text-ink-2">
          <span className="font-medium">Tu nota:</span> {c.seguimiento_nota}
        </p>
      )}

      {editando ? (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-edge p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" className={CAMPO} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            {[
              ["Hoy 4pm", enDias(0, 16)],
              ["Mañana", enDias(1, 10)],
              ["En 3 días", enDias(3, 10)],
              ["En 1 semana", enDias(7, 10)],
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
              <button
                type="button"
                disabled={enCurso}
                onClick={() => enviar({ estado: null })}
                className="ml-auto text-xs text-red-600 hover:underline"
              >
                Quitar seguimiento
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-indigo-300"
          >
            {pendiente ? <Pencil size={12} /> : <CalendarClock size={12} />}
            {pendiente ? "Cambiar fecha" : "Programar seguimiento"}
          </button>
          {pendiente && (
            <button
              type="button"
              disabled={enCurso}
              onClick={() => enviar({ estado: "hecho" })}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
            >
              {enCurso ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Marcar como contactado
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </article>
  );
}
