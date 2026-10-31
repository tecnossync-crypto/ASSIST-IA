"use client";

import { useState, useTransition } from "react";
import { Loader2, Phone, Hourglass, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import type { EstadoColaIA } from "@/lib/api";
import { guardarHorarioColaAction, vaciarColaAction } from "@/app/(app)/configuracion/integraciones/actions";
import { BotonAccion } from "@/components/BotonAccion";

const CAMPO =
  "rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50";

const DIAS = [
  { n: 1, e: "L" },
  { n: 2, e: "M" },
  { n: 3, e: "X" },
  { n: 4, e: "J" },
  { n: 5, e: "V" },
  { n: 6, e: "S" },
  { n: 7, e: "D" },
];

function Dato({ Icon, etiqueta, valor, nota }: { Icon: typeof Phone; etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-edge bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon size={13} />
        {etiqueta}
      </div>
      <div className="mt-1 text-xl font-semibold text-ink">{valor}</div>
      {nota && <div className="mt-0.5 text-[11px] text-muted">{nota}</div>}
    </div>
  );
}

export function ColaEnvioMasivo({ estado }: { estado: EstadoColaIA }) {
  const h = estado.horario;
  const [activo, setActivo] = useState(Boolean(h.desde && h.hasta));
  const [desde, setDesde] = useState(h.desde ?? "08:00");
  const [hasta, setHasta] = useState(h.hasta ?? "18:00");
  const [dias, setDias] = useState<number[]>(h.dias ?? [1, 2, 3, 4, 5, 6, 7]);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  function alternarDia(n: number) {
    setDias((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]));
  }

  function guardar() {
    setMensaje(null);
    if (activo && dias.length === 0) return setMensaje({ ok: false, texto: "Elige al menos un día." });
    iniciar(async () => {
      const r = await guardarHorarioColaAction(
        activo ? { desde, hasta, dias, zona: h.zona } : { desde: null, hasta: null, dias: null, zona: null }
      );
      setMensaje(r.error ? { ok: false, texto: r.error } : { ok: true, texto: "Horario guardado." });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato Icon={Phone} etiqueta="En el aire" valor={`${estado.en_aire} / ${estado.limite}`} nota="llamadas de IA ahora" />
        <Dato
          Icon={Hourglass}
          etiqueta="En cola"
          valor={String(estado.pendientes)}
          nota={estado.pendientes_fuera_de_horario > 0 ? `${estado.pendientes_fuera_de_horario} esperan el horario` : "esperando línea libre"}
        />
        <Dato Icon={CheckCircle2} etiqueta="Enviadas hoy" valor={String(estado.enviadas_hoy)} />
        <Dato Icon={AlertTriangle} etiqueta="Fallidas hoy" valor={String(estado.fallidas_hoy)} />
      </div>

      {estado.pendientes > 0 && !estado.en_horario && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Clock size={14} className="mt-0.5 flex-shrink-0" />
          Ahora mismo estás fuera del horario permitido: las llamadas en cola salen cuando abra la ventana.
        </p>
      )}

      <div className="rounded-lg border border-edge bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">Horario permitido para llamar</h3>
        <p className="mt-0.5 text-xs text-muted">
          Aplica a las llamadas automáticas (API, flujos y campañas). Fuera de este horario nada sale: se queda en cola
          hasta que abra la ventana. Zona horaria: {h.zona}.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Limitar el horario
        </label>
        {activo && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Desde
              <input type="time" className={CAMPO} value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Hasta
              <input type="time" className={CAMPO} value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>
            <div className="flex gap-1">
              {DIAS.map((d) => (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => alternarDia(d.n)}
                  className={`h-8 w-8 rounded-md border text-xs font-medium ${
                    dias.includes(d.n) ? "border-indigo-500 bg-indigo-600 text-white" : "border-edge bg-surface text-muted"
                  }`}
                >
                  {d.e}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={guardar}
            disabled={pendiente}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pendiente && <Loader2 size={14} className="animate-spin" />}
            Guardar horario
          </button>
          {mensaje && <span className={`text-xs ${mensaje.ok ? "text-emerald-600" : "text-red-600"}`}>{mensaje.texto}</span>}
        </div>
      </div>

      {estado.pendientes > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-surface px-4 py-3">
          <p className="text-xs text-muted">
            ¿Mandaron un lote por error? Cancela lo que sigue esperando (las llamadas ya hechas no se tocan).
          </p>
          <BotonAccion
            accion={vaciarColaAction}
            mensajeConfirmar={`¿Cancelar las ${estado.pendientes} llamadas que esperan en la cola?`}
            mensajeExito="Cola vaciada."
          >
            Vaciar cola
          </BotonAccion>
        </div>
      )}
    </div>
  );
}
