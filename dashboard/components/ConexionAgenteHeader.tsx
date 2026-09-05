"use client";

import { useEffect, useRef, useState } from "react";
import { Headset, LogOut } from "lucide-react";
import { useAgenteSoftphone } from "@/components/AgenteSoftphoneContext";
import { EstadoAgenteBoton } from "@/components/EstadoAgenteBoton";
import type { EstadoPresencia } from "@/lib/api";

// Control de "conectarse/desconectarse como agente" (identidad por PIN, para
// recibir llamadas en el softphone del navegador) — vive arriba a la
// derecha, junto al botón de modo oscuro, en vez de escondido en una
// insignia flotante: así se ve de un vistazo si se van a recibir llamadas o
// no, y hay un solo lugar para desconectarse cuando no hace falta.
export function ConexionAgenteHeader() {
  const { sesion, pin, setPin, loginAbierto, setLoginAbierto, errorLogin, cargandoLogin, iniciarSesionAgente, cerrarSesionAgente } =
    useAgenteSoftphone();
  const [estadoPresencia, setEstadoPresencia] = useState<EstadoPresencia | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sesion) {
      setEstadoPresencia(null);
      return;
    }
    let cancelado = false;
    fetch(`/api/agentes/${sesion.usuarioId}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelado && data?.agente) setEstadoPresencia(data.agente.estado_presencia);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [sesion]);

  useEffect(() => {
    function cerrarSiFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setLoginAbierto(false);
    }
    document.addEventListener("mousedown", cerrarSiFuera);
    return () => document.removeEventListener("mousedown", cerrarSiFuera);
  }, [setLoginAbierto]);

  if (sesion) {
    return (
      <div className="flex items-center gap-2">
        {estadoPresencia && <EstadoAgenteBoton usuarioId={sesion.usuarioId} estadoInicial={estadoPresencia} />}
        <div className="flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs text-ink-2 shadow-sm">
          <Headset size={12} className="text-emerald-600" />
          {sesion.nombre}
          <button
            type="button"
            onClick={cerrarSesionAgente}
            className="text-muted hover:text-red-600"
            aria-label="Desconectarse como agente"
            title="Desconectarse — deja de recibir llamadas"
          >
            <LogOut size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setLoginAbierto(!loginAbierto)}
        className="flex items-center gap-1.5 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs text-muted shadow-sm hover:border-indigo-300 hover:text-indigo-700"
      >
        <Headset size={12} />
        Conectarme como agente
      </button>

      {loginAbierto && (
        <div className="absolute right-0 z-50 mt-1.5 w-56 rounded-xl border border-edge bg-surface p-3 shadow-lg">
          <p className="mb-2 text-xs font-medium text-ink-2">PIN de agente</p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && iniciarSesionAgente()}
            inputMode="numeric"
            maxLength={6}
            autoFocus
            className="mb-2 w-full rounded-md border border-edge px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLoginAbierto(false)}
              className="flex-1 rounded-md border border-edge py-1.5 text-xs text-muted hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={iniciarSesionAgente}
              disabled={!pin || cargandoLogin}
              className="flex-1 rounded-md bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Entrar
            </button>
          </div>
          {errorLogin && <p className="mt-1.5 text-xs text-red-600">{errorLogin}</p>}
        </div>
      )}
    </div>
  );
}
