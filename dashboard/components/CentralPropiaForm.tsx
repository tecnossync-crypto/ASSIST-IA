"use client";

import { useActionState, useState } from "react";
import { Loader2, ShieldAlert, CheckCircle2, PhoneCall } from "lucide-react";
import { guardarCentralPropiaAction, type EstadoCentralPropia } from "@/app/(app)/configuracion/empresa/actions";
import type { EmpresaConfig } from "@/lib/api";

const ESTADO_INICIAL: EstadoCentralPropia = {};
const CAMPO =
  "rounded-md border border-edge bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/**
 * Vincular la plataforma con la central telefónica (PBX) propia del
 * cliente vía troncal SIP — ver backend/src/lib/twilio-empresa.ts
 * (resolverDestinoSaliente). Apagado por defecto: mientras "Activar" no
 * esté marcado, las llamadas siguen saliendo por Twilio directo, como
 * hasta ahora.
 */
export function CentralPropiaForm({ empresa }: { empresa: EmpresaConfig }) {
  const [estado, formAction, cargando] = useActionState(guardarCentralPropiaAction, ESTADO_INICIAL);
  const [authTipo, setAuthTipo] = useState<"ip" | "credenciales">(empresa.central_propia_auth_tipo ?? "ip");

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-edge bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <PhoneCall size={16} className="text-indigo-600" />
        Central telefónica propia (PBX)
      </div>
      <p className="text-xs text-muted">
        Conecta tu propia central (vía troncal SIP, ej. Twilio Elastic SIP Trunking) para que las llamadas salgan
        y/o entren por tu proveedor (ej. Claro) en vez de por la red de Twilio directamente. Necesita coordinación
        técnica con quien administra tu central — mientras "Activar" esté apagado, nada cambia.
      </p>

      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" name="activa" defaultChecked={empresa.central_propia_activa} className="rounded border-edge" />
        Activar central propia
      </label>

      <div className="flex flex-col gap-1">
        <label htmlFor="dominio" className="text-sm font-medium text-ink-2">
          Dominio o IP pública de tu central
        </label>
        <input
          id="dominio"
          name="dominio"
          defaultValue={empresa.central_propia_dominio ?? ""}
          placeholder="ej. pbx.tuempresa.com o una IP pública"
          className={CAMPO}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="authTipo" className="text-sm font-medium text-ink-2">
            Autenticación
          </label>
          <select
            id="authTipo"
            name="authTipo"
            value={authTipo}
            onChange={(e) => setAuthTipo(e.target.value as "ip" | "credenciales")}
            className={CAMPO}
          >
            <option value="ip">Whitelist de IP (sin usuario/clave)</option>
            <option value="credenciales">Usuario y contraseña SIP</option>
          </select>
        </div>
        {authTipo === "credenciales" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="usuario" className="text-sm font-medium text-ink-2">
              Usuario SIP
            </label>
            <input id="usuario" name="usuario" defaultValue={empresa.central_propia_usuario ?? ""} className={CAMPO} />
          </div>
        )}
      </div>

      {authTipo === "credenciales" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-ink-2">
            Contraseña SIP {empresa.central_propia_tiene_password && "(ya hay una guardada — deja vacío para no cambiarla)"}
          </label>
          <input id="password" name="password" type="password" placeholder="••••••••" className={CAMPO} />
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="saliente" defaultChecked={empresa.central_propia_saliente} className="rounded border-edge" />
          Llamadas salientes por la central propia
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="entrante" defaultChecked={empresa.central_propia_entrante} className="rounded border-edge" />
          Llamadas entrantes por la central propia
        </label>
      </div>

      <button
        type="submit"
        disabled={cargando}
        className="ts-brand-button flex w-fit items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
      >
        {cargando && <Loader2 size={14} className="animate-spin" />}
        {cargando ? "Guardando…" : "Guardar"}
      </button>

      {estado.error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <ShieldAlert size={13} /> {estado.error}
        </p>
      )}
      {estado.ok && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 size={13} /> Guardado.
        </p>
      )}
    </form>
  );
}
