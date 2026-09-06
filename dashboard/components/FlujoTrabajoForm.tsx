"use client";

import { useState } from "react";
import { crearFlujoAction } from "@/app/(app)/configuracion/flujos/actions";
import type { DisparadorFlujo, AccionFlujo, EtiquetaDisponible } from "@/lib/api";

const DISPARADORES: { valor: DisparadorFlujo; label: string }[] = [
  { valor: "llamada_completada", label: "La llamada termina completada (sin transferir)" },
  { valor: "llamada_transferida", label: "La llamada termina transferida a un humano" },
  { valor: "llamada_no_contesta", label: "El cliente no contesta / falla / ocupado" },
  { valor: "etiqueta_agregada", label: "Se le agrega una etiqueta a un contacto" },
];

export function FlujoTrabajoForm({ etiquetas }: { etiquetas: EtiquetaDisponible[] }) {
  const [disparador, setDisparador] = useState<DisparadorFlujo>("llamada_completada");
  const [accion, setAccion] = useState<AccionFlujo>("agregar_etiqueta");
  const [modoLlamada, setModoLlamada] = useState<"inmediato" | "programada">("inmediato");

  const disparadorPorEtiqueta = disparador === "etiqueta_agregada";

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
          value={disparador}
          onChange={(e) => {
            const valor = e.target.value as DisparadorFlujo;
            setDisparador(valor);
            // Este disparador solo tiene sentido con la acción de llamar —
            // los otros disparadores son "cómo terminó la llamada", ahí no
            // aplica llamar de nuevo automáticamente al mismo contacto.
            if (valor === "etiqueta_agregada") setAccion("llamar_contacto");
            else if (accion === "llamar_contacto") setAccion("agregar_etiqueta");
          }}
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {DISPARADORES.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {disparadorPorEtiqueta && (
        <div className="flex flex-col gap-1">
          <label htmlFor="etiqueta_disparador" className="text-sm text-ink-2">
            ¿Cuál etiqueta dispara la regla?
          </label>
          {etiquetas.length > 0 ? (
            <select
              id="etiqueta_disparador"
              name="etiqueta_disparador"
              required
              className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {etiquetas.map((e) => (
                <option key={e.nombre} value={e.nombre}>
                  {e.nombre}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="etiqueta_disparador"
              name="etiqueta_disparador"
              required
              placeholder="Ej: interesado, moroso, VIP"
              className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          )}
          {etiquetas.length === 0 && (
            <p className="text-xs text-muted">
              No hay etiquetas configuradas todavía en Configuración → Contactos, pero puedes escribir el nombre
              exacto de la que vayas a usar.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="accion" className="text-sm font-medium text-ink-2">
          Entonces…
        </label>
        <select
          id="accion"
          name="accion"
          value={accion}
          onChange={(e) => setAccion(e.target.value as AccionFlujo)}
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {!disparadorPorEtiqueta && <option value="agregar_etiqueta">Agregar una etiqueta al contacto</option>}
          {!disparadorPorEtiqueta && <option value="crear_solicitud">Crear una solicitud de seguimiento</option>}
          <option value="llamar_contacto">Llamar al contacto (con IA)</option>
        </select>
      </div>

      {accion === "agregar_etiqueta" && (
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
      )}

      {accion === "crear_solicitud" && (
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

      {accion === "llamar_contacto" && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-edge p-3">
          <label className="text-sm text-ink-2">¿Cuándo se hace la llamada?</label>
          <div className="flex gap-4 text-sm text-ink-2">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="modo_llamada"
                value="inmediato"
                checked={modoLlamada === "inmediato"}
                onChange={() => setModoLlamada("inmediato")}
              />
              Inmediato
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="modo_llamada"
                value="programada"
                checked={modoLlamada === "programada"}
                onChange={() => setModoLlamada("programada")}
              />
              Fecha y hora específica
            </label>
          </div>
          {modoLlamada === "programada" && (
            <input
              type="datetime-local"
              name="fecha_llamada"
              required
              className="w-fit rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          )}
          <p className="text-xs text-muted">
            La llamada la hace el agente de IA con el guion normal configurado en Configuración → Inteligencia
            Artificial.
          </p>
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
