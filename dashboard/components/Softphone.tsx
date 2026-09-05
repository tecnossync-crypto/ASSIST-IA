"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneIncoming, Phone, PhoneOff } from "lucide-react";
import { useAgenteSoftphone } from "@/components/AgenteSoftphoneContext";

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

  if (!enLlamada) return null;

  return (
    <div className="fixed bottom-28 right-6 z-[60] w-72 overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl shadow-slate-900/20 sm:right-8">
      <div className="flex items-center gap-3 bg-gradient-to-br from-emerald-600 to-emerald-700 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white">
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
  );
}
