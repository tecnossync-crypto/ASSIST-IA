"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAgenteSoftphone } from "@/components/AgenteSoftphoneContext";

export interface AgenteParaTransferir {
  id: string;
  nombre: string;
}

export type EstadoSoftphone = "desconectado" | "listo" | "sonando" | "en_curso";

interface SoftphoneCtx {
  estado: EstadoSoftphone;
  /** Número (o "Llamada entrante") de quien llama. */
  numeroEntrante: string;
  /** Segundos desde que se contestó. */
  segundos: number;
  silenciado: boolean;
  enEspera: boolean;
  cargandoAccion: boolean;
  mensaje: string;
  agentes: AgenteParaTransferir[];
  transfiriendoA: string | null;
  contestar: () => void;
  rechazar: () => void;
  colgar: () => void;
  alternarSilencio: () => void;
  alternarEspera: () => Promise<void>;
  cargarAgentes: () => Promise<void>;
  transferirA: (agente: AgenteParaTransferir) => Promise<boolean>;
}

const Ctx = createContext<SoftphoneCtx | null>(null);

/** Dos tonos suaves que se repiten mientras suena una llamada entrante. */
function tonoDeLlamada(): () => void {
  let ctx: AudioContext | null = null;
  function sonar() {
    try {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx ??= new Ctor();
      const c = ctx;
      [523, 659].forEach((frecuencia, i) => {
        const osc = c.createOscillator();
        const ganancia = c.createGain();
        osc.frequency.value = frecuencia;
        ganancia.gain.value = 0.06;
        osc.connect(ganancia).connect(c.destination);
        osc.start(c.currentTime + i * 0.25);
        osc.stop(c.currentTime + i * 0.25 + 0.2);
      });
    } catch {
      // el navegador no deja sonar audio todavía: el aviso visual basta
    }
  }
  sonar();
  const intervalo = setInterval(sonar, 2500);
  return () => {
    clearInterval(intervalo);
    ctx?.close().catch(() => {});
  };
}

/**
 * Registra el navegador como softphone (Twilio Voice SDK) y expone el estado
 * de la llamada a toda la interfaz: el panel de teléfono muestra desde ahí la
 * llamada entrante, los controles y el cronómetro (antes esto vivía en una
 * tarjeta flotante aparte).
 *
 * Por defecto se registra con una identidad compartida de la empresa; si
 * alguien se identifica con su PIN de agente, se registra con SU identidad y
 * queda disponible en su cola — así el enrutamiento por colas/turnos
 * realmente le puede tocar a él (ver AgenteSoftphoneContext).
 */
export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const { sesion } = useAgenteSoftphone();
  const deviceRef = useRef<import("@twilio/voice-sdk").Device | null>(null);
  const callRef = useRef<import("@twilio/voice-sdk").Call | null>(null);
  const [estado, setEstado] = useState<EstadoSoftphone>("desconectado");
  const [numeroEntrante, setNumeroEntrante] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [silenciado, setSilenciado] = useState(false);
  const [enEspera, setEnEspera] = useState(false);
  const [cargandoAccion, setCargandoAccion] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [agentes, setAgentes] = useState<AgenteParaTransferir[]>([]);
  const [transfiriendoA, setTransfiriendoA] = useState<string | null>(null);

  const reiniciarEstadoLlamada = useCallback(() => {
    setEstado("listo");
    callRef.current = null;
    setSilenciado(false);
    setEnEspera(false);
    setSegundos(0);
    setMensaje("");
  }, []);

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

        device.on("registered", () => setEstado((prev) => (prev === "desconectado" ? "listo" : prev)));
        device.on("unregistered", () => setEstado("desconectado"));
        device.on("error", (err) => console.error("Softphone: error de Twilio Device", err));

        device.on("incoming", (call) => {
          callRef.current = call;
          setNumeroEntrante(call.parameters.From ?? "Llamada entrante");
          setSegundos(0);

          call.on("accept", () => setEstado("en_curso"));
          call.on("disconnect", () => reiniciarEstadoLlamada());

          // El backend marca esto SOLO cuando el que está recibiendo esta
          // pierna es el mismo agente que originó la llamada él mismo
          // (panel de teléfono → "llamar a este contacto") — ver
          // conferencia-agentes.ts. No tiene sentido pedirle que "conteste"
          // su propia llamada saliente, así que se conecta directo sin
          // mostrar el botón de Contestar/Rechazar.
          if (call.customParameters?.get("autoContestar") === "true") {
            call.accept();
            setEstado("en_curso");
            return;
          }

          setEstado("sonando");
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

  // Cronómetro de la llamada en curso.
  useEffect(() => {
    if (estado !== "en_curso") return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado]);

  // Tono y título de la pestaña mientras suena, para notarlo aunque se esté
  // trabajando en otra pestaña.
  useEffect(() => {
    if (estado !== "sonando") return;
    const tituloOriginal = document.title;
    const detenerTono = tonoDeLlamada();
    let alterna = false;
    const parpadeo = setInterval(() => {
      alterna = !alterna;
      document.title = alterna ? "📞 Llamada entrante" : tituloOriginal;
    }, 900);
    return () => {
      detenerTono();
      clearInterval(parpadeo);
      document.title = tituloOriginal;
    };
  }, [estado]);

  const contestar = useCallback(() => {
    callRef.current?.accept();
  }, []);

  const rechazar = useCallback(() => {
    callRef.current?.reject();
    reiniciarEstadoLlamada();
  }, [reiniciarEstadoLlamada]);

  const colgar = useCallback(() => {
    callRef.current?.disconnect();
  }, []);

  // Silenciar el propio micrófono lo resuelve el SDK de Twilio en el
  // navegador — no hace falta ningún endpoint del backend para esto.
  const alternarSilencio = useCallback(() => {
    setSilenciado((actual) => {
      const nuevo = !actual;
      callRef.current?.mute(nuevo);
      return nuevo;
    });
  }, []);

  // Poner al CLIENTE en espera (con música) sí requiere la API de Twilio, ya
  // que actúa sobre SU pierna dentro de la conferencia, no la del agente.
  const alternarEspera = useCallback(async () => {
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
  }, [cargandoAccion, enEspera]);

  const cargarAgentes = useCallback(async () => {
    setMensaje("");
    try {
      const res = await fetch("/api/panel/datos", { cache: "no-store" });
      const data = await res.json();
      setAgentes(data.agentes ?? []);
    } catch {
      setAgentes([]);
    }
  }, []);

  const transferirA = useCallback(async (agente: AgenteParaTransferir) => {
    const callSid = callRef.current?.parameters.CallSid;
    if (!callSid) return false;
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
      return true;
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
      return false;
    } finally {
      setTransfiriendoA(null);
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        estado,
        numeroEntrante,
        segundos,
        silenciado,
        enEspera,
        cargandoAccion,
        mensaje,
        agentes,
        transfiriendoA,
        contestar,
        rechazar,
        colgar,
        alternarSilencio,
        alternarEspera,
        cargarAgentes,
        transferirA,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSoftphone(): SoftphoneCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSoftphone debe usarse dentro de <SoftphoneProvider>");
  return ctx;
}

