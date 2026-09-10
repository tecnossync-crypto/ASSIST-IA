"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, ShieldAlert, ChevronDown, ChevronRight, Power } from "lucide-react";
import type { ReglaApiLlamadas } from "@/lib/api";
import {
  crearReglaAction,
  alternarReglaAction,
  eliminarReglaAction,
  type EstadoRegla,
} from "@/app/(app)/configuracion/integraciones/actions";
import { BotonAccion } from "@/components/BotonAccion";

const ESTADO_INICIAL: EstadoRegla = {};
const CAMPO =
  "rounded-md border border-edge bg-surface px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const ETIQUETAS_OPERADOR: Record<string, string> = { igual: "es igual a", contiene: "contiene" };

export function ReglasApiLlamadas({ reglas }: { reglas: ReglaApiLlamadas[] }) {
  const [estado, formAction, cargando] = useActionState(crearReglaAction, ESTADO_INICIAL);
  const [mostrarForm, setMostrarForm] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {reglas.length === 0 && !mostrarForm && (
        <p className="text-sm text-muted">
          Sin reglas todavía — se usa el &quot;prompt&quot; que mande la plataforma externa tal cual, si mandó uno.
        </p>
      )}

      {reglas.length > 0 && (
        <div className="flex flex-col divide-y divide-edge rounded-md border border-edge">
          {reglas.map((r) => (
            <FilaRegla key={r.id} regla={r} />
          ))}
        </div>
      )}

      {mostrarForm ? (
        <form action={formAction} className="flex flex-col gap-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
          <input name="nombre" required placeholder="Nombre de la regla (ej. Zoho SalesIQ)" className={CAMPO} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input name="campo" required placeholder="Campo del POST (ej. origen)" className={CAMPO} />
            <select name="operador" defaultValue="igual" className={CAMPO}>
              <option value="igual">es igual a</option>
              <option value="contiene">contiene</option>
            </select>
            <input name="valor" required placeholder="Valor (ej. zoho-salesiq)" className={CAMPO} />
          </div>
          <textarea
            name="promptPersonalizado"
            required
            rows={4}
            placeholder="Guion completo a usar cuando esta regla aplique — reemplaza el prompt que mande la plataforma externa."
            className={`${CAMPO} font-mono`}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={cargando}
              className="ts-brand-button rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {cargando ? "Creando…" : "Crear regla"}
            </button>
            <button type="button" onClick={() => setMostrarForm(false)} className="text-xs text-muted hover:text-ink-2">
              Cancelar
            </button>
          </div>
          {estado.error && (
            <p className="flex items-center gap-1 text-xs text-red-600">
              <ShieldAlert size={12} /> {estado.error}
            </p>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setMostrarForm(true)}
          className="flex w-fit items-center gap-1.5 text-sm text-indigo-700 hover:underline"
        >
          <Plus size={14} /> Nueva regla
        </button>
      )}
    </div>
  );
}

function FilaRegla({ regla }: { regla: ReglaApiLlamadas }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left text-sm"
        >
          {abierto ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
          <span className={`font-medium ${regla.activa ? "text-ink" : "text-muted line-through"}`}>{regla.nombre}</span>
          <span className="text-xs text-muted">
            {regla.campo} {ETIQUETAS_OPERADOR[regla.operador] ?? regla.operador} &quot;{regla.valor}&quot;
          </span>
        </button>
        <div className="flex items-center gap-3">
          <BotonAccion
            accion={alternarReglaAction.bind(null, regla.id, !regla.activa)}
            mensajeExito={regla.activa ? "Desactivada." : "Activada."}
            className={`flex items-center gap-1 text-xs ${regla.activa ? "text-emerald-700" : "text-muted"} hover:underline`}
          >
            <Power size={11} />
            {regla.activa ? "Activa" : "Inactiva"}
          </BotonAccion>
          <BotonAccion
            accion={eliminarReglaAction.bind(null, regla.id)}
            mensajeExito="Eliminada."
            mensajeConfirmar={`¿Eliminar la regla "${regla.nombre}"?`}
            className="text-muted hover:text-red-600"
          >
            <Trash2 size={13} />
          </BotonAccion>
        </div>
      </div>
      {abierto && (
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-xs text-ink-2">
          {regla.prompt_personalizado}
        </pre>
      )}
    </div>
  );
}
