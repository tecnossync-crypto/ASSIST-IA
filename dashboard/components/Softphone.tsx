"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneIncoming, Phone, PhoneOff, Headset, LogOut } from "lucide-react";
import { EstadoAgenteBoton } from "@/components/EstadoAgenteBoton";
import type { EstadoPresencia } from "@/lib/api";

interface SesionAgente {
  usuarioId: string;
  nombre: string;
}

// Registra el navegador como softphone (Twilio Voice SDK) para que las
// "llamadas normales" suenen aquí dentro en vez de en un teléfono externo.
// Vive montado globalmente (ver app/layout.tsx). Por defecto se registra con
// una identidad compartida de la empresa; si alguien se identifica con su
// PIN de agente (Configuración → Agentes), se registra con SU identidad y
// queda marcado disponible en su cola — así el enrutamiento por colas/turnos
// realmente le puede tocar a él.
export function Softphone() {
  const deviceRef = useRef<import("@twilio/voice-sdk").Device | null>(null);
  const callRef = useRef<import("@twilio/voice-sdk").Call | null>(null);
  const [estadoLlamada, setEstadoLlamada] = useState<"desconectado" | "listo" | "sonando" | "en_curso">(
    "desconectado"
  );
  const [numeroEntrante, setNumeroEntrante] = useState("");

  const [sesion, setSesion] = useState<SesionAgente | null>(null);
  const [pin, setPin] = useState("");
  const [loginAbierto, setLoginAbierto] = useState(false);
  const [errorLogin, setErrorLogin] = useState("");
  const [cargandoLogin, setCargandoLogin] = useState(false);
  // Estado de presencia del agente identificado por PIN (distinto del que
  // pueda tener, arriba a la derecha, quien esté logueado al dashboard con
  // su propia cuenta — acá puede ser una identidad totalmente distinta).
  const [estadoPresencia, setEstadoPresencia] = useState<EstadoPresencia | null>(null);

  // Recuerda la sesión de agente entre visitas (por navegador).
  useEffect(() => {
    const guardada = localStorage.getItem("sesionAgenteSoftphone");
    if (guardada) {
      try {
        setSesion(JSON.parse(guardada));
      } catch {
        localStorage.removeItem("sesionAgenteSoftphone");
      }
    }
  }, []);

  // Al identificarse (o recuperar la sesión guardada), lee el estado de
  // presencia real de ESE agente para que el botón no arranque en blanco.
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

  // (Re)registra el Device cada vez que cambia la sesión (identidad
  // compartida si no hay agente identificado, o la del agente si sí).
  useEffect(() => {
    let cancelado = false;

    async function registrar() {
      try {
        deviceRef.current?.destroy();
        deviceRef.current = null;

        const url = sesion ? `/api/voice-token?usuarioId=${sesion.usuarioId}` : "/api/voice-token";
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return; // empresa sin softphone configurado todavía, no es un error visible
        const { token } = await res.json();
        if (cancelado) return;

        const { Device } = await import("@twilio/voice-sdk");
        const device = new Device(token, { logLevel: "error" });
        deviceRef.current = device;

        device.on("registered", () => setEstadoLlamada("listo"));
        device.on("unregistered", () => setEstadoLlamada("desconectado"));
        device.on("error", (err) => console.error("Softphone: error de Twilio Device", err));

        device.on("incoming", (call) => {
          callRef.current = call;
          setNumeroEntrante(call.parameters.From ?? "Llamada entrante");
          setEstadoLlamada("sonando");

          call.on("accept", () => setEstadoLlamada("en_curso"));
          call.on("disconnect", () => {
            setEstadoLlamada("listo");
            callRef.current = null;
          });
          call.on("cancel", () => {
            setEstadoLlamada("listo");
            callRef.current = null;
          });
          call.on("reject", () => {
            setEstadoLlamada("listo");
            callRef.current = null;
          });
        });

        await device.register();
        if (sesion) marcarDisponibilidad(sesion.usuarioId, true);
      } catch (err) {
        console.error("Softphone: no se pudo registrar", err);
      }
    }

    registrar();

    return () => {
      cancelado = true;
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.usuarioId]);

  // Si el agente cierra/recarga la pestaña, que quede marcado no disponible
  // (sendBeacon no espera respuesta, así que llega aunque la pestaña se cierre).
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

      const nueva: SesionAgente = { usuarioId: data.usuarioId, nombre: data.nombre };
      localStorage.setItem("sesionAgenteSoftphone", JSON.stringify(nueva));
      setSesion(nueva);
      setLoginAbierto(false);
      setPin("");
    } catch (err) {
      setErrorLogin(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCargandoLogin(false);
    }
  }

  async function cerrarSesionAgente() {
    if (sesion) await marcarDisponibilidad(sesion.usuarioId, false);
    localStorage.removeItem("sesionAgenteSoftphone");
    setSesion(null);
  }

  function contestar() {
    callRef.current?.accept();
  }

  function rechazar() {
    callRef.current?.reject();
    setEstadoLlamada("listo");
  }

  function colgar() {
    callRef.current?.disconnect();
  }

  const enLlamada = estadoLlamada === "sonando" || estadoLlamada === "en_curso";

  return (
    <>
      {/* Insignia de agente: identificarse es opcional — sin esto, se sigue
          recibiendo con la identidad compartida de la empresa como hasta ahora. */}
      {!enLlamada && (
        <div className="fixed bottom-28 right-6 z-[55] sm:right-8">
          {sesion ? (
            <div className="flex items-center gap-2">
              {estadoPresencia && <EstadoAgenteBoton usuarioId={sesion.usuarioId} estadoInicial={estadoPresencia} />}
              <div className="flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs text-ink-2 shadow-md">
                <Headset size={12} className="text-emerald-600" />
                {sesion.nombre}
                <button
                  type="button"
                  onClick={cerrarSesionAgente}
                  className="text-muted hover:text-red-600"
                  aria-label="Salir"
                  title="Salir de la sesión de agente"
                >
                  <LogOut size={12} />
                </button>
              </div>
            </div>
          ) : loginAbierto ? (
            <div className="w-56 rounded-xl border border-edge bg-surface p-3 shadow-lg">
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
          ) : (
            <button
              type="button"
              onClick={() => setLoginAbierto(true)}
              className="flex items-center gap-1.5 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs text-muted shadow-md hover:border-indigo-300 hover:text-indigo-700"
            >
              <Headset size={12} />
              Conectarme como agente
            </button>
          )}
        </div>
      )}

      {enLlamada && (
        <div className="fixed bottom-28 right-6 z-[60] w-72 overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl shadow-slate-900/20 sm:right-8">
          <div className="flex items-center gap-3 bg-gradient-to-br from-emerald-600 to-emerald-700 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/15 text-white">
              <PhoneIncoming size={16} className={estadoLlamada === "sonando" ? "animate-pulse" : ""} />
            </span>
            <div>
              <p className="text-sm font-medium text-white">
                {estadoLlamada === "sonando" ? "Llamada entrante" : "En llamada"}
              </p>
              <p className="text-xs text-emerald-100">{numeroEntrante}</p>
            </div>
          </div>
          <div className="flex gap-2 p-3">
            {estadoLlamada === "sonando" ? (
              <>
                <button
                  type="button"
                  onClick={rechazar}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-50 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  <PhoneOff size={14} /> Rechazar
                </button>
                <button
                  type="button"
                  onClick={contestar}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  <Phone size={14} /> Contestar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={colgar}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                <PhoneOff size={14} /> Colgar
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
