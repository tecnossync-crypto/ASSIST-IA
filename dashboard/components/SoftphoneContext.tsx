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
  /** Id de la llamada en la plataforma (para mostrar su resumen de la IA); "" si no se conoce. */
  llamadaIdEntrante: string;
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
  /** CallSid de la pierna de ESTE asesor en la llamada actual ("" si no hay): permite cortar la conferencia desde el servidor. */
  callSidAgente: () => string;
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
  // Para leerlo dentro de efectos que no deben reiniciarse cuando cambia.
  const numeroEntranteRef = useRef("");
  numeroEntranteRef.current = numeroEntrante;
  const [llamadaIdEntrante, setLlamadaIdEntrante] = useState("");
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
    setLlamadaIdEntrante("");
  }, []);

  // Cierra el estado SOLO si la llamada que avisa sigue siendo la actual: el aviso tardío de una llamada vieja no debe
  // tumbar la que se está atendiendo ahora.
  const finalizarSiEsActual = useCallback(
    (call: import("@twilio/voice-sdk").Call) => {
      if (callRef.current === call) reiniciarEstadoLlamada();
    },
    [reiniciarEstadoLlamada]
  );

  // (Re)registra el Device cada vez que cambia la sesión (identidad
  // compartida si no hay agente identificado, o la del agente si sí).
  useEffect(() => {
    let cancelado = false;
    const limpiezas: Array<() => void> = [];

    async function registrar() {
      try {
        deviceRef.current?.destroy();
        deviceRef.current = null;

        // El token es siempre el del usuario con sesión iniciada (lo resuelve el servidor).
        const res = await fetch("/api/voice-token", { cache: "no-store" });
        if (!res.ok) return; // empresa sin softphone configurado todavía, no es un error visible
        const { token } = await res.json();
        if (cancelado) return;

        const { Device } = await import("@twilio/voice-sdk");
        const device = new Device(token, { logLevel: "error" });
        deviceRef.current = device;

        // Si el teléfono se desconecta (token vencido tras dormir la PC, red caída, error de Twilio) se vuelve a registrar
        // solo: antes quedaba "Sin conexión" para siempre y había que cerrar y abrir la ventana de la extensión.
        let reintento: ReturnType<typeof setTimeout> | null = null;
        const reintentarRegistro = async () => {
          if (cancelado || deviceRef.current !== device) return;
          if (device.state === "registered" || device.state === "registering") return;
          try {
            const r = await fetch("/api/voice-token", { cache: "no-store" });
            if (r.status === 401 || r.status === 403) {
              // La sesión del dashboard venció: se manda al login en vez de dejar un panel muerto.
              if (location.pathname.startsWith("/extension-panel")) location.href = "/login?next=/extension-panel";
              return;
            }
            if (!r.ok || cancelado || deviceRef.current !== device) return;
            const { token: nuevo } = await r.json();
            device.updateToken(nuevo);
            await device.register();
          } catch (err) {
            console.error("Softphone: no se pudo reconectar", err);
          }
        };
        const programarReintento = (ms: number) => {
          if (reintento) clearTimeout(reintento);
          reintento = setTimeout(reintentarRegistro, ms);
        };

        device.on("registered", () => setEstado((prev) => (prev === "desconectado" ? "listo" : prev)));
        device.on("unregistered", () => {
          // No pisar una llamada en curso con "desconectado": solo se marca así si no se está atendiendo nada.
          setEstado((prev) => (prev === "en_curso" || prev === "sonando" ? prev : "desconectado"));
          programarReintento(3000);
        });
        device.on("error", (err) => {
          console.error("Softphone: error de Twilio Device", err);
          programarReintento(5000);
        });

        const alVolver = () => {
          if (document.visibilityState === "visible") void reintentarRegistro();
        };
        const latido = setInterval(reintentarRegistro, 30_000);
        window.addEventListener("online", reintentarRegistro);
        document.addEventListener("visibilitychange", alVolver);
        limpiezas.push(() => {
          clearInterval(latido);
          if (reintento) clearTimeout(reintento);
          window.removeEventListener("online", reintentarRegistro);
          document.removeEventListener("visibilitychange", alVolver);
        });

        // El token dura 1 hora: sin renovarlo, el teléfono dejaba de recibir
        // llamadas a la hora de estar abierto aunque el asesor siguiera Activo.
        device.on("tokenWillExpire", async () => {
          try {
            const r = await fetch("/api/voice-token", { cache: "no-store" });
            if (!r.ok) return;
            const { token: nuevo } = await r.json();
            device.updateToken(nuevo);
          } catch (err) {
            console.error("Softphone: no se pudo renovar el token", err);
          }
        });

        device.on("incoming", (call) => {
          // Ya hay una llamada sonando o en curso: la nueva NO puede pisarla (antes
          // el panel perdía el control de la que se estaba atendiendo). Se rechaza
          // para que el sistema la ofrezca a otro asesor o la deje en cola.
          if (callRef.current) {
            const numero = call.customParameters?.get("numero") || call.parameters.From || "otro cliente";
            call.reject();
            setMensaje(`Entró otra llamada (${numero}) mientras atendías; se envió a otro asesor.`);
            return;
          }
          callRef.current = call;
          // El servidor manda el teléfono del cliente y el id de la llamada junto
          // al timbre (si no, "From" es el número de la empresa, no el del cliente).
          setNumeroEntrante(call.customParameters?.get("numero") || call.parameters.From || "Llamada entrante");
          setLlamadaIdEntrante(call.customParameters?.get("llamadaId") ?? "");
          setSegundos(0);

          call.on("accept", () => setEstado("en_curso"));
          // Cualquier forma de terminar libera el panel (también las llamadas que se contestan solas: antes no
          // escuchaban cancel/reject/error y el panel se quedaba "en llamada" para siempre).
          call.on("disconnect", () => finalizarSiEsActual(call));
          call.on("cancel", () => finalizarSiEsActual(call));
          call.on("reject", () => finalizarSiEsActual(call));
          call.on("error", () => {
            if (call.status() === "closed") finalizarSiEsActual(call);
          });

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
        });

        // Registrar el teléfono NO cambia el estado del asesor: se pone Activo /
        // En pausa / Inactivo a mano desde el panel.
        await device.register();

        // Permiso para avisar con una notificación del sistema cuando entre una
        // llamada y la ventana esté minimizada o detrás de otras.
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
      } catch (err) {
        console.error("Softphone: no se pudo registrar", err);
      }
    }

    registrar();

    return () => {
      cancelado = true;
      limpiezas.forEach((f) => f());
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.usuarioId]);

  // Vigilante: si el SDK nunca avisó que la llamada terminó (señal perdida, ventana en segundo plano, evento que no
  // llega), el panel no se queda congelado "en llamada": revisa el estado real de la pierna cada par de segundos.
  useEffect(() => {
    if (estado !== "en_curso" && estado !== "sonando") return;
    const t = setInterval(() => {
      const call = callRef.current;
      if (!call || call.status() === "closed") reiniciarEstadoLlamada();
    }, 2000);
    return () => clearInterval(t);
  }, [estado, reiniciarEstadoLlamada]);

  // Si el cliente cuelga, Twilio termina la conferencia y el navegador debería enterarse solo; pero si ese aviso no
  // llega (central, red, ventana en segundo plano), el panel se quedaba "en llamada" con nadie del otro lado. Mientras
  // hay una llamada en curso se pregunta al servidor si ya la dio por terminada y, si es así, se corta la pierna.
  useEffect(() => {
    if (estado !== "en_curso" || !llamadaIdEntrante) return;
    const call = callRef.current;
    let cancelado = false;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/llamada-estado?llamadaId=${encodeURIComponent(llamadaIdEntrante)}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelado) return;
        const { llamada } = await res.json();
        if (!llamada || !["completada", "fallida"].includes(llamada.estado)) return;
        if (cancelado || !call || callRef.current !== call) return;
        call.disconnect();
        setTimeout(() => {
          if (callRef.current === call) {
            deviceRef.current?.disconnectAll();
            reiniciarEstadoLlamada();
          }
        }, 1500);
      } catch {
        // se reintenta en el próximo tick
      }
    }, 4000);
    return () => {
      cancelado = true;
      clearInterval(t);
    };
  }, [estado, llamadaIdEntrante, reiniciarEstadoLlamada]);

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

    // Notificación del sistema: se ve aunque la ventana esté minimizada; al
    // hacer click trae la ventana al frente.
    let notificacion: Notification | null = null;
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        notificacion = new Notification("📞 Llamada entrante", {
          body: numeroEntranteRef.current || "Alguien está llamando",
          tag: "llamada-entrante",
          requireInteraction: true,
        });
        notificacion.onclick = () => {
          window.focus();
          notificacion?.close();
        };
      }
    } catch {
      // algunos navegadores no permiten crearla: el tono y el título siguen avisando
    }

    let alterna = false;
    const parpadeo = setInterval(() => {
      alterna = !alterna;
      document.title = alterna ? "📞 Llamada entrante" : tituloOriginal;
    }, 900);
    return () => {
      detenerTono();
      notificacion?.close();
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
    const call = callRef.current;
    if (!call) return;
    call.disconnect();
    // El botón nunca queda pegado: si el SDK no confirma el corte en 1.5 s se libera el panel y se cierra todo audio.
    setTimeout(() => {
      if (callRef.current !== call) return;
      deviceRef.current?.disconnectAll();
      reiniciarEstadoLlamada();
    }, 1500);
  }, [reiniciarEstadoLlamada]);

  const callSidAgente = useCallback(() => callRef.current?.parameters?.CallSid ?? "", []);

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
        llamadaIdEntrante,
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
        callSidAgente,
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


