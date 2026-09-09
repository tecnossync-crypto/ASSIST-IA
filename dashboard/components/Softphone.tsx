"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneIncoming, Phone, PhoneOff, MicOff, Mic, Pause, Play, ArrowRightLeft, X, Loader2 } from "lucide-react";
import { useAgenteSoftphone } from "@/components/AgenteSoftphoneContext";

interface AgenteParaTransferir {
  id: string;
  nombre: string;
}

// Registra el navegador como softphone (Twilio Voice SDK) para que las
// "llamadas normales" suenen aquí dentro en vez de en un teléfono externo.
// Vive montado globalmente (ver app/(app)/layout.tsx). Por defecto se
// registra con una identidad compartida de la empresa; si alguien se
// identifica con su PIN de agente (control "Conectarme como agente", arriba
// a la derecha), se registra con SU identidad y queda marcado disponible en
// su cola — así el enrutamiento por colas/turnos realmente le puede tocar a
// él. La identificación/estado/desconexión viven en el header
// (ConexionAgenteHeader) — acá solo queda el manejo de la llamada en sí.
export function Softphone() {
  const { sesion } = useAgenteSoftphone();
  const deviceRef = useRef<import("@twilio/voice-sdk").Device | null>(null);
  const callRef = useRef<import("@twilio/voice-sdk").Call | null>(null);
  const [estadoLlamada, setEstadoLlamada] = useState<"desconectado" | "listo" | "sonando" | "en_curso">(
    "desconectado"
  );
  const [numeroEntrante, setNumeroEntrante] = useState("");
  const [silenciado, setSilenciado] = useState(false);
  const [enEspera, setEnEspera] = useState(false);
  const [cargandoAccion, setCargandoAccion] = useState(false);
  const [mostrarTransferir, setMostrarTransferir] = useState(false);
  const [agentes, setAgentes] = useState<AgenteParaTransferir[]>([]);
  const [transfiriendoA, setTransfiriendoA] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");

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
          call.on("disconnect", () => reiniciarEstadoLlamada());
          call.on("cancel", () => reiniciarEstadoLlamada());
          call.on("reject", () => reiniciarEstadoLlamada());
        });

        await device.register();
        if (sesion) {
          await fetch("/api/agentes/presencia", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ usuarioId: sesion.usuarioId, disponible: true }),
          }).catch(() => {});
        }
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

  function reiniciarEstadoLlamada() {
    setEstadoLlamada("listo");
    callRef.current = null;
    setSilenciado(false);
    setEnEspera(false);
    setMostrarTransferir(false);
    setMensaje("");
  }

  function contestar() {
    callRef.current?.accept();
  }

  function rechazar() {
    callRef.current?.reject();
    reiniciarEstadoLlamada();
  }

  function colgar() {
    callRef.current?.disconnect();
  }

  // Silenciar el propio micrófono lo resuelve el SDK de Twilio en el
  // navegador — no hace falta ningún endpoint del backend para esto.
  function alternarSilencio() {
    const nuevo = !silenciado;
    callRef.current?.mute(nuevo);
    setSilenciado(nuevo);
  }

  // Poner al CLIENTE en espera (con música) sí requiere la API de Twilio, ya
  // que actúa sobre SU pierna dentro de la conferencia, no la del agente.
  async function alternarEspera() {
    const callSid = callRef.current?.parameters.CallSid;
    if (!callSid || cargandoAccion) return;
    const nuevo = !enEspera;
    setCargandoAccion(true);
    setMensaje("");
    try {
      const res = await fetch("/api/llamada-hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agenteCallSid: callSid, activar: nuevo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar el estado de espera");
      setEnEspera(nuevo);
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCargandoAccion(false);
    }
  }

  async function abrirTransferir() {
    setMostrarTransferir(true);
    setMensaje("");
    try {
      const res = await fetch("/api/panel/datos", { cache: "no-store" });
      const data = await res.json();
      setAgentes(data.agentes ?? []);
    } catch {
      setAgentes([]);
    }
  }

  async function transferirA(agente: AgenteParaTransferir) {
    const callSid = callRef.current?.parameters.CallSid;
    if (!callSid) return;
    setTransfiriendoA(agente.id);
    setMensaje("");
    try {
      const res = await fetch("/api/llamada-transferir-agente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agenteCallSid: callSid, nuevoAgenteUsuarioId: agente.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo transferir");
      setMensaje(`Se está llamando a ${agente.nombre} — cuando conteste, puedes colgar tu parte para dejarlos solos.`);
      setMostrarTransferir(false);
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setTransfiriendoA(null);
    }
  }

  const enLlamada = estadoLlamada === "sonando" || estadoLlamada === "en_curso";

  if (!enLlamada) return null;

  return (
    <div className="fixed bottom-28 right-3 left-3 z-[60] w-auto max-w-80 overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl shadow-slate-900/20 sm:left-auto sm:right-8 sm:w-80">
      <div className="flex items-center gap-3 bg-gradient-to-br from-emerald-600 to-emerald-700 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white">
          <PhoneIncoming size={16} className={estadoLlamada === "sonando" ? "animate-pulse" : ""} />
        </span>
        <div>
          <p className="text-sm font-medium text-white">
            {estadoLlamada === "sonando" ? "Llamada entrante" : "En llamada"}
            {enEspera && " · En espera"}
          </p>
          <p className="text-xs text-emerald-100">{numeroEntrante}</p>
        </div>
      </div>

      {mostrarTransferir ? (
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-ink-2">Transferir a…</p>
            <button
              type="button"
              onClick={() => setMostrarTransferir(false)}
              aria-label="Cancelar"
              className="text-muted hover:text-ink-2"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex max-h-48 flex-col divide-y divide-edge overflow-y-auto">
            {agentes.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => transferirA(a)}
                disabled={transfiriendoA !== null}
                className="flex items-center justify-between py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                {a.nombre}
                {transfiriendoA === a.id && <Loader2 size={13} className="animate-spin text-indigo-500" />}
              </button>
            ))}
            {agentes.length === 0 && <p className="py-3 text-center text-xs text-muted">No hay otros agentes.</p>}
          </div>
        </div>
      ) : (
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
            <>
              <button
                type="button"
                onClick={alternarSilencio}
                title={silenciado ? "Activar micrófono" : "Silenciar"}
                className={
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border " +
                  (silenciado ? "border-amber-300 bg-amber-50 text-amber-700" : "border-edge text-ink-2 hover:bg-surface-2")
                }
              >
                {silenciado ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
              <button
                type="button"
                onClick={alternarEspera}
                disabled={cargandoAccion}
                title={enEspera ? "Reanudar" : "Poner en espera"}
                className={
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border disabled:opacity-50 " +
                  (enEspera ? "border-amber-300 bg-amber-50 text-amber-700" : "border-edge text-ink-2 hover:bg-surface-2")
                }
              >
                {cargandoAccion ? <Loader2 size={15} className="animate-spin" /> : enEspera ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button
                type="button"
                onClick={abrirTransferir}
                title="Transferir a otro agente"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-edge text-ink-2 hover:bg-surface-2"
              >
                <ArrowRightLeft size={15} />
              </button>
              <button
                type="button"
                onClick={colgar}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                <PhoneOff size={14} /> Colgar
              </button>
            </>
          )}
        </div>
      )}

      {mensaje && <p className="border-t border-edge px-3 py-2 text-xs text-ink-2">{mensaje}</p>}
    </div>
  );
}
