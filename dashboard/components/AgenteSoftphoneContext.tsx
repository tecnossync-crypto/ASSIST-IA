"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface SesionAgenteSoftphone {
  usuarioId: string;
  nombre: string;
}

interface AgenteSoftphoneCtx {
  sesion: SesionAgenteSoftphone | null;
  pin: string;
  setPin: (v: string) => void;
  loginAbierto: boolean;
  setLoginAbierto: (v: boolean) => void;
  errorLogin: string;
  cargandoLogin: boolean;
  iniciarSesionAgente: () => Promise<void>;
  cerrarSesionAgente: () => Promise<void>;
}

const Ctx = createContext<AgenteSoftphoneCtx | null>(null);

const CLAVE_LOCALSTORAGE = "sesionAgenteSoftphone";

/**
 * Identidad de "conectarse como agente" con PIN (distinta de la sesión del
 * dashboard con email/contraseña): la comparten el control de conectar/
 * desconectar de la barra de arriba (junto al modo oscuro) y el softphone
 * flotante que de verdad registra el Device de Twilio para recibir llamadas.
 * Vive en un contexto para que ambos lean/escriban la MISMA sesión sin
 * duplicar el estado ni depender de eventos de localStorage entre pestañas.
 */
export function AgenteSoftphoneProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionAgenteSoftphone | null>(null);
  const [pin, setPin] = useState("");
  const [loginAbierto, setLoginAbierto] = useState(false);
  const [errorLogin, setErrorLogin] = useState("");
  const [cargandoLogin, setCargandoLogin] = useState(false);

  useEffect(() => {
    const guardada = localStorage.getItem(CLAVE_LOCALSTORAGE);
    if (guardada) {
      try {
        setSesion(JSON.parse(guardada));
      } catch {
        localStorage.removeItem(CLAVE_LOCALSTORAGE);
      }
    }
  }, []);

  // Si se cierra/recarga la pestaña estando conectado, que quede marcado no
  // disponible (sendBeacon no espera respuesta, llega igual al cerrar).
  useEffect(() => {
    function avisarDesconexion() {
      if (!sesion) return;
      const blob = new Blob([JSON.stringify({ usuarioId: sesion.usuarioId, disponible: false })], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/agentes/presencia", blob);
    }
    window.addEventListener("beforeunload", avisarDesconexion);
    return () => window.removeEventListener("beforeunload", avisarDesconexion);
  }, [sesion]);

  async function marcarDisponibilidad(usuarioId: string, disponible: boolean) {
    await fetch("/api/agentes/presencia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuarioId, disponible }),
    }).catch(() => {});
  }

  async function iniciarSesionAgente() {
    if (!pin) return;
    setCargandoLogin(true);
    setErrorLogin("");
    try {
      const res = await fetch("/api/agentes/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "PIN inválido");

      const nueva: SesionAgenteSoftphone = { usuarioId: data.usuarioId, nombre: data.nombre };
      localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(nueva));
      setSesion(nueva);
      setLoginAbierto(false);
      setPin("");
      // Al poner el PIN correcto queda disponible de una vez — no depende de
      // que el Device de Twilio del softphone termine de registrarse (eso
      // también lo marca, pero puede tardar o fallar si algo del softphone
      // no está bien configurado, y aun así el agente ya se identificó).
      marcarDisponibilidad(nueva.usuarioId, true);
    } catch (err) {
      setErrorLogin(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCargandoLogin(false);
    }
  }

  async function cerrarSesionAgente() {
    if (sesion) await marcarDisponibilidad(sesion.usuarioId, false);
    localStorage.removeItem(CLAVE_LOCALSTORAGE);
    setSesion(null);
  }

  return (
    <Ctx.Provider
      value={{ sesion, pin, setPin, loginAbierto, setLoginAbierto, errorLogin, cargandoLogin, iniciarSesionAgente, cerrarSesionAgente }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAgenteSoftphone(): AgenteSoftphoneCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAgenteSoftphone debe usarse dentro de <AgenteSoftphoneProvider>");
  return ctx;
}
