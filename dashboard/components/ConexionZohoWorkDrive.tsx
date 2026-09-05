"use client";

import { useState } from "react";
import { CloudCheck, ExternalLink } from "lucide-react";
import { EMPRESA_ID, type EstadoZohoWorkDrive } from "@/lib/api";
import { guardarCarpetaZohoAction, desconectarZohoAction } from "@/app/(app)/configuracion/almacenamiento/actions";
import { OverlayGuardando } from "./OverlayGuardando";
import { BotonAccion } from "./BotonAccion";

const BACKEND_PUBLIC_URL = process.env.NEXT_PUBLIC_BACKEND_PUBLIC_URL || "";

export function ConexionZohoWorkDrive({ estado }: { estado: EstadoZohoWorkDrive }) {
  const [carpetaId, setCarpetaId] = useState(estado.carpetaId ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  if (!estado.configurado) {
    return (
      <div className="rounded-lg border border-dashed border-edge bg-surface-2 p-4">
        <p className="text-sm font-medium text-ink-2">Zoho WorkDrive</p>
        <p className="mt-1 text-xs text-muted">
          Falta configurar el Client ID/Secret de la app de Zoho a nivel de plataforma — pídeselo a tu
          desarrollador antes de poder conectar.
        </p>
      </div>
    );
  }

  if (!estado.conectado) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-edge p-4">
        <div>
          <p className="text-sm font-medium text-ink-2">Zoho WorkDrive</p>
          <p className="text-xs text-muted">Cada grabación se sube automáticamente a la carpeta que elijas.</p>
        </div>
        <a
          href={`${BACKEND_PUBLIC_URL}/api/integraciones/zoho-workdrive/conectar?empresaId=${EMPRESA_ID}`}
          className="ts-brand-button flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white shadow shadow-indigo-500/30"
        >
          Conectar con Zoho
          <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  async function guardarCarpeta() {
    setGuardando(true);
    const formData = new FormData();
    formData.set("carpeta_id", carpetaId);
    await guardarCarpetaZohoAction(formData);
    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  return (
    <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <OverlayGuardando estado={guardando ? "guardando" : guardado ? "ok" : null} />
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-800">
          <CloudCheck size={15} />
          Conectado a Zoho WorkDrive
        </p>
        <BotonAccion
          accion={desconectarZohoAction}
          mensajeExito="Desconectado."
          mensajeConfirmar="¿Desconectar Zoho WorkDrive? Las grabaciones dejarán de subirse ahí hasta que vuelvas a conectar."
        >
          Desconectar
        </BotonAccion>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-ink-2">ID de la carpeta destino en WorkDrive</label>
        <div className="flex gap-2">
          <input
            value={carpetaId}
            onChange={(e) => setCarpetaId(e.target.value)}
            placeholder="ej. jk3x9..."
            className="flex-1 rounded-md border border-edge px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={guardarCarpeta}
            className="ts-brand-button rounded-md px-3 py-1.5 text-xs font-medium text-white shadow shadow-indigo-500/30"
          >
            Guardar
          </button>
        </div>
        <p className="text-xs text-muted">
          Se ve en la URL cuando abres la carpeta en WorkDrive (después de <span className="font-mono">/folders/</span>).
        </p>
      </div>
    </div>
  );
}
