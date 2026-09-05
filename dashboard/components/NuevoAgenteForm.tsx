"use client";

import { useActionState, useState } from "react";
import { KeyRound, Copy, Check, ShieldAlert } from "lucide-react";
import { crearAgenteAction, type EstadoCrearAgente } from "@/app/(app)/configuracion/agentes/actions";
import type { Cola } from "@/lib/api";

const ESTADO_INICIAL: EstadoCrearAgente = {};

export function NuevoAgenteForm({ colas }: { colas: Cola[] }) {
  const [estado, formAction, cargando] = useActionState(crearAgenteAction, ESTADO_INICIAL);
  const [rol, setRol] = useState("operador");
  const [copiado, setCopiado] = useState(false);

  const requiereAcceso = rol !== "operador";

  async function copiarPassword() {
    if (!estado.passwordGenerada) return;
    try {
      await navigator.clipboard.writeText(estado.passwordGenerada);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // portapapeles no disponible — el usuario puede seleccionar el texto a mano
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {estado.passwordGenerada && (
        <div className="flex flex-col gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">
            {estado.nombreCreado} fue creado. Copia esta contraseña ahora — no se volverá a mostrar.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded border border-emerald-300 bg-surface px-2 py-1 font-mono text-sm">
              {estado.emailCreado} · {estado.passwordGenerada}
            </code>
            <button
              type="button"
              onClick={copiarPassword}
              className="flex items-center gap-1 rounded-md border border-emerald-300 bg-surface px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            >
              {copiado ? <Check size={13} /> : <Copy size={13} />}
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {estado.error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <ShieldAlert size={15} />
          {estado.error}
        </div>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input
          name="nombre"
          required
          placeholder="Nombre"
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          name="rol"
          value={rol}
          onChange={(e) => setRol(e.target.value)}
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="operador">Agente</option>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Administrador</option>
        </select>
        <select
          name="colaId"
          defaultValue=""
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Sin cola</option>
          {colas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        <input
          name="pin"
          inputMode="numeric"
          pattern="\d{4,6}"
          title="4 a 6 dígitos"
          placeholder={rol === "operador" ? "PIN softphone (4-6 dígitos)" : "PIN softphone (opcional)"}
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        {requiereAcceso ? (
          <p className="col-span-full flex items-center gap-1.5 text-xs text-muted sm:col-start-1">
            <KeyRound size={12} />
            Este rol siempre tiene acceso al dashboard completo — te daré una contraseña temporal al crearlo.
          </p>
        ) : (
          <label className="col-span-full flex items-center gap-2 text-xs text-ink-2 sm:col-start-1">
            <input type="checkbox" name="conAcceso" className="rounded border-edge" />
            También darle acceso al dashboard completo (además del PIN)
          </label>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="ts-brand-button col-span-full self-start rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
        >
          {cargando ? "Creando..." : "Agregar usuario"}
        </button>
      </form>
    </div>
  );
}
