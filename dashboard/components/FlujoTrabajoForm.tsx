"use client";

import { useState } from "react";
import { crearFlujoAction } from "@/app/(app)/configuracion/flujos/actions";

const DISPARADORES = [
  { valor: "llamada_completada", label: "La llamada termina completada (sin transferir)" },
  { valor: "llamada_transferida", label: "La llamada termina transferida a un humano" },
  { valor: "llamada_no_contesta", label: "El cliente no contesta / falla / ocupado" },
];

export function FlujoTrabajoForm() {
  const [accion, setAccion] = useState<"agregar_etiqueta" | "crear_solicitud">("agregar_etiqueta");

  return (
    <form action={crearFlujoAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="nombre" className="text-sm font-medium text-ink-2">
          Nombre de la regla
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          placeholder="Ej: Etiquetar transferidos como urgente"
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="disparador" className="text-sm font-medium text-ink-2">
          Cuando…
        </label>
        <select
          id="disparador"
          name="disparador"
          required
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {DISPARADORES.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="accion" className="text-sm font-medium text-ink-2">
          Entonces…
        </label>
        <select
          id="accion"
          name="accion"
          value={accion}
          onChange={(e) => setAccion(e.target.value as "agregar_etiqueta" | "crear_solicitud")}
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="agregar_etiqueta">Agregar una etiqueta al contacto</option>
          <option value="crear_solicitud">Crear una solicitud de seguimiento</option>
        </select>
      </div>

      {accion === "agregar_etiqueta" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="etiqueta" className="text-sm text-ink-2">
            Etiqueta a agregar
          </label>
          <input
            id="etiqueta"
            name="etiqueta"
            required
            placeholder="Ej: transferido, moroso, interesado"
            className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="tipo" className="text-sm text-ink-2">
              Tipo de solicitud
            </label>
            <input
              id="tipo"
              name="tipo"
              placeholder="seguimiento"
              className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="descripcion" className="text-sm text-ink-2">
              Descripción
            </label>
            <input
              id="descripcion"
              name="descripcion"
              placeholder="Opcional"
              className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        className="ts-brand-button self-start rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
      >
        Crear regla
      </button>
    </form>
  );
}
