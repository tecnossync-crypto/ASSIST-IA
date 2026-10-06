"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import {
  crearExtensionAction,
  cambiarColaExtensionAction,
  cambiarActivaExtensionAction,
  eliminarExtensionAction,
  type EstadoExtension,
} from "@/app/(app)/configuracion/enrutamiento/actions";
import { BotonAccion } from "./BotonAccion";
import type { ExtensionCentral } from "@/lib/api";

const CAMPO =
  "rounded-md border border-edge bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const SELECT_CHICO =
  "rounded-md border border-edge bg-surface px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const ESTADO_INICIAL: EstadoExtension = {};

type ColaOpcion = { id: string; nombre: string };

function FilaExtension({ ext, colas }: { ext: ExtensionCentral; colas: ColaOpcion[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          Ext. {ext.numero}
          {ext.nombre && <span className="ml-2 font-normal text-muted">{ext.nombre}</span>}
        </p>
        <p className="text-xs text-muted">{ext.cola_nombre ?? "General (sin departamento)"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action={cambiarColaExtensionAction} title="Departamento al que pertenece esta extensión">
          <input type="hidden" name="id" value={ext.id} />
          <select
            name="colaId"
            defaultValue={ext.cola_id ?? ""}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className={SELECT_CHICO}
          >
            <option value="">General (sin departamento)</option>
            {colas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </form>

        <form action={cambiarActivaExtensionAction} title="Si está apagada, no suena aunque pertenezca al departamento">
          <input type="hidden" name="id" value={ext.id} />
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-2">
            <input
              type="checkbox"
              name="activa"
              defaultChecked={ext.activa}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="rounded border-edge"
            />
            Suena
          </label>
        </form>

        <BotonAccion
          accion={eliminarExtensionAction.bind(null, ext.id)}
          mensajeExito="Eliminada."
          mensajeConfirmar={`¿Quitar la extensión ${ext.numero}?`}
        >
          Eliminar
        </BotonAccion>
      </div>
    </div>
  );
}

/**
 * Extensiones de la central y a qué departamento pertenecen. Cuando una
 * llamada se transfiere a la central suenan A LA VEZ todas las extensiones
 * activas de ese departamento (o las generales, si el departamento no tiene).
 * Desmarcar "Suena" deja una extensión fuera sin borrarla — así se elige
 * entre "todas las extensiones" o solo algunas específicas.
 */
export function ExtensionesCentral({ extensiones, colas }: { extensiones: ExtensionCentral[]; colas: ColaOpcion[] }) {
  const [estado, formAction, cargando] = useActionState(crearExtensionAction, ESTADO_INICIAL);
  const formRef = useRef<HTMLFormElement>(null);

  // Limpia el formulario solo si la extensión se creó bien (si hubo error,
  // se conserva lo escrito para corregirlo).
  useEffect(() => {
    if (estado.ok) formRef.current?.reset();
  }, [estado]);

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="ext-numero" className="text-xs font-medium text-ink-2">
            Extensión
          </label>
          <input id="ext-numero" name="numero" required inputMode="numeric" placeholder="ej. 227" className={`${CAMPO} w-28`} />
        </div>
        <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <label htmlFor="ext-nombre" className="text-xs font-medium text-ink-2">
            Nombre (opcional)
          </label>
          <input id="ext-nombre" name="nombre" placeholder="ej. Cobranza - Ana" className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ext-cola" className="text-xs font-medium text-ink-2">
            Departamento
          </label>
          <select id="ext-cola" name="colaId" className={CAMPO} defaultValue="">
            <option value="">General (sin departamento)</option>
            {colas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={cargando}
          className="ts-brand-button flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
        >
          {cargando && <Loader2 size={14} className="animate-spin" />}
          Agregar
        </button>
      </form>

      {estado.error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <ShieldAlert size={13} /> {estado.error}
        </p>
      )}
      {estado.ok && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 size={13} /> Extensión agregada.
        </p>
      )}

      <div className="flex flex-col divide-y divide-edge">
        {extensiones.map((e) => (
          <FilaExtension key={e.id} ext={e} colas={colas} />
        ))}
        {extensiones.length === 0 && <p className="py-2 text-sm text-muted">No hay extensiones cargadas todavía.</p>}
      </div>
    </div>
  );
}
