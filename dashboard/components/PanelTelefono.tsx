"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  ClipboardList,
  Delete,
  History,
  Hourglass,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Play,
  Users,
  X,
} from "lucide-react";
import type { ContactoResumen, LlamadaResumen, Cola, TransferenciaContexto, LlamadaEnCola } from "@/lib/api";
import { useAgenteSoftphone } from "@/components/AgenteSoftphoneContext";
import { useSoftphone } from "@/components/SoftphoneContext";
import { ContextoLlamada } from "@/components/ContextoLlamada";
import { SelectorEstadoAsesor, opcionDeEstado, useActividadHoy, usePresencia } from "@/components/estado-asesor";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const LETRAS: Record<string, string> = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
  "0": "+",
};

type Tab = "marcar" | "contactos" | "recientes" | "contexto" | "cola";
type EstadoLlamada = "idle" | "marcando" | "en_curso" | "finalizada" | "error";

// Cada cuánto se pregunta si la IA transfirió alguna llamada nueva, y qué tan
// reciente debe ser para que el panel se abra solo al cargar la página.
const INTERVALO_CONTEXTO_MS = 4000;
const RECIENTE_PARA_ABRIR_MS = 2 * 60 * 1000;
const CONTEXTO_VIGENTE_MS = 10 * 60 * 1000;
const CLAVE_VISTAS = "contexto-transferencias-vistas";

function leerVistas(): string[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE_VISTAS);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function guardarVistas(ids: string[]) {
  try {
    window.localStorage.setItem(CLAVE_VISTAS, JSON.stringify(ids.slice(-50)));
  } catch {
    // sin almacenamiento: solo se pierde recordar qué se vio
  }
}

/** Dos tonos cortos para avisar de una transferencia nueva (si el navegador deja sonar audio). */
function pitar() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((frecuencia, i) => {
      const osc = ctx.createOscillator();
      const ganancia = ctx.createGain();
      osc.frequency.value = frecuencia;
      ganancia.gain.value = 0.05;
      osc.connect(ganancia).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.14);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    // el navegador bloqueó el audio: el aviso visual basta
  }
}

function formatCronometro(segundos: number): string {
  const m = Math.floor(segundos / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(segundos % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function formatTiempoHablado(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Nombre guardado del contacto que tiene ese número (compara los últimos 10 dígitos). */
function nombreDeContacto(numero: string, contactos: ContactoResumen[]): string | null {
  const fin = soloDigitos(numero).slice(-10);
  if (fin.length < 7) return null;
  const c = contactos.find((x) => soloDigitos(x.numero).slice(-10) === fin);
  return c ? [c.nombre, c.apellido].filter(Boolean).join(" ") || null : null;
}

/**
 * Panel del asesor. Dos modos:
 * - "flotante": tarjeta con botón circular abajo a la derecha en todo el dashboard.
 * - "ventana": ocupa TODA la ventana (la de la extensión de Chrome, ~380×640):
 *   encabezado fijo arriba, contenido que se desplaza y el botón de llamar fijo
 *   abajo — antes la tarjeta flotante era más alta que la ventana y el
 *   encabezado (con el selector de estado) quedaba cortado fuera de pantalla.
 */
export function PanelTelefono({
  modo = "flotante",
  usuarioId,
  nombre,
}: { modo?: "flotante" | "ventana"; usuarioId?: string; nombre?: string } = {}) {
  const esVentana = modo === "ventana";
  const router = useRouter();
  // Si hay un agente identificado con PIN, la llamada debe timbrarle
  // SIEMPRE a él (ver backend: iniciarConferenciaConAgentes con
  // usuarioIdDirecto) — no al enrutamiento general de la cola, que es para
  // repartir entre varios, no para esto.
  const { sesion: sesionAgente } = useAgenteSoftphone();
  const sp = useSoftphone();

  const idAsesor = sesionAgente?.usuarioId ?? usuarioId;
  const nombreAsesor = sesionAgente?.nombre ?? nombre ?? "Asesor";
  const presencia = usePresencia(idAsesor);
  const infoEstado = opcionDeEstado(presencia.estado);

  const [contactos, setContactos] = useState<ContactoResumen[]>([]);
  const [recientes, setRecientes] = useState<LlamadaResumen[]>([]);
  const [colas, setColas] = useState<Cola[]>([]);
  // En modo ventana (extensión de Chrome) el panel siempre está abierto; en
  // modo flotante se abre/cierra con el botón circular.
  const [abiertoFlotante, setAbierto] = useState(false);
  const abierto = esVentana || abiertoFlotante;
  const [tab, setTab] = useState<Tab>("marcar");
  const [numero, setNumero] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [colaId, setColaId] = useState("");
  const [estado, setEstado] = useState<EstadoLlamada>("idle");
  const [mensaje, setMensaje] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [colgando, setColgando] = useState(false);
  const [mostrarTransferir, setMostrarTransferir] = useState(false);
  const callSidRef = useRef<string | null>(null);

  // Contexto de llamadas que la IA transfirió (pestaña "Contexto").
  const [contexto, setContexto] = useState<TransferenciaContexto[]>([]);
  const [contextoActivo, setContextoActivo] = useState(false);
  const [vistas, setVistas] = useState<string[]>([]);
  // Ids de las transferencias de los últimos minutos (se recalcula en cada sondeo, no al renderizar).
  const [idsVigentes, setIdsVigentes] = useState<string[]>([]);
  // Ids ya conocidos en esta sesión; null hasta la primera respuesta, para no
  // abrir el panel por transferencias viejas al cargar la página.
  const conocidasRef = useRef<Set<string> | null>(null);
  const vistasRef = useRef<string[]>([]);
  // Para consultar el resumen YA (sin esperar el sondeo de 4 s) cuando empieza a sonar una llamada.
  const refrescarContextoRef = useRef<() => void>(() => {});

  // Cola de espera: clientes que esperan en línea porque no había asesores.
  const [cola, setCola] = useState<LlamadaEnCola[]>([]);
  const [colaRecibidaEn, setColaRecibidaEn] = useState(0);
  const [ahora, setAhora] = useState(0);
  const [atendiendo, setAtendiendo] = useState<string | null>(null);
  const [errorCola, setErrorCola] = useState("");
  const conocidasColaRef = useRef<Set<string> | null>(null);
  const estadoAsesorRef = useRef<string | null>(null);
  const enLlamadaRef = useRef(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cronoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sonando = sp.estado === "sonando";
  const enLlamadaSoftphone = sp.estado === "en_curso";
  const llamadaPropia = estado === "marcando" || estado === "en_curso";
  const enLlamada = llamadaPropia || enLlamadaSoftphone;
  // En una llamada que marcó este panel el reloj arranca cuando CONTESTA el cliente
  // (lo detecta el sondeo); en una que entró por el teléfono, al contestar.
  const cronometro = llamadaPropia ? segundos : sp.segundos;

  const actividadHoy = useActividadHoy(idAsesor, enLlamada);
  estadoAsesorRef.current = presencia.estado;
  enLlamadaRef.current = enLlamada;

  function limpiarTemporizadores() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (cronoRef.current) clearInterval(cronoRef.current);
    pollRef.current = null;
    cronoRef.current = null;
  }

  useEffect(() => () => limpiarTemporizadores(), []);

  async function cargarDatos() {
    try {
      const res = await fetch("/api/panel/datos", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setContactos(data.contactos ?? []);
      setRecientes(data.recientes ?? []);
      setColas(data.colas ?? []);
    } catch {
      // silencioso: el panel simplemente queda con lo que ya tenía
    }
  }

  // Se pide una vez al montar (no bloquea el layout ni el resto de la
  // página — el botón flotante ya se ve, los datos llegan un instante
  // después) y de nuevo cada vez que se abre, por si cambió algo.
  useEffect(() => {
    cargarDatos();
  }, []);

  // Una llamada que suena abre el panel sola: es lo primero que hay que ver.
  useEffect(() => {
    if (sonando) {
      setAbierto(true);
      setMostrarTransferir(false);
      refrescarContextoRef.current();
    }
  }, [sonando]);

  // Al terminar una llamada se refresca "Recientes".
  useEffect(() => {
    if (sp.estado === "listo") cargarDatos();
  }, [sp.estado]);

  // Pregunta cada pocos segundos si la IA le pasó una llamada nueva a una
  // persona. Si hay una que no se ha visto, abre el panel en "Contexto" y
  // avisa (sonido corto + punto rojo en el botón), así quien contesta sabe de
  // qué se trata antes de saludar.
  useEffect(() => {
    vistasRef.current = leerVistas();
    setVistas(vistasRef.current);
    let cancelado = false;

    async function revisar() {
      try {
        const res = await fetch("/api/panel/contexto", { cache: "no-store" });
        if (!res.ok || cancelado) return;
        const data = (await res.json()) as { activo?: boolean; llamadas?: TransferenciaContexto[] };
        if (cancelado) return;
        const llamadas = data.llamadas ?? [];
        setContextoActivo(!!data.activo);
        setContexto(llamadas);
        setIdsVigentes(
          llamadas
            .filter((l) => Date.now() - new Date(l.resumen_en ?? l.iniciada_en).getTime() < CONTEXTO_VIGENTE_MS)
            .map((l) => l.id)
        );

        const primera = conocidasRef.current === null;
        const conocidas = conocidasRef.current ?? new Set<string>();
        let hayNueva = false;
        for (const l of llamadas) {
          if (conocidas.has(l.id)) continue;
          conocidas.add(l.id);
          if (vistasRef.current.includes(l.id)) continue;
          const edad = Date.now() - new Date(l.resumen_en ?? l.iniciada_en).getTime();
          if (!primera || edad < RECIENTE_PARA_ABRIR_MS) hayNueva = true;
        }
        conocidasRef.current = conocidas;

        if (hayNueva) {
          setAbierto(true);
          setTab("contexto");
          pitar();
        }
      } catch {
        // silencioso: se reintenta en el próximo tick
      }
    }

    refrescarContextoRef.current = revisar;
    revisar();
    const intervalo = setInterval(revisar, INTERVALO_CONTEXTO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  // Sondea la cola de espera. Si llega alguien nuevo y estoy activo y libre,
  // el panel se abre en "Cola" con un aviso sonoro.
  useEffect(() => {
    let cancelado = false;
    async function revisarCola() {
      try {
        const res = await fetch("/api/panel/cola", { cache: "no-store" });
        if (!res.ok || cancelado) return;
        const data = (await res.json()) as { llamadas?: LlamadaEnCola[] };
        if (cancelado) return;
        const llamadas = data.llamadas ?? [];
        setCola(llamadas);
        setColaRecibidaEn(Date.now());

        const primera = conocidasColaRef.current === null;
        const conocidas = conocidasColaRef.current ?? new Set<string>();
        let hayNueva = false;
        for (const l of llamadas) {
          if (conocidas.has(l.id)) continue;
          conocidas.add(l.id);
          if (!primera || l.espera_segundos < 120) hayNueva = true;
        }
        conocidasColaRef.current = conocidas;

        // Se avisa salvo que el asesor esté en pausa/inactivo (si su estado aún no cargó, también).
        const estadoAviso = estadoAsesorRef.current;
        if (hayNueva && estadoAviso !== "descanso" && estadoAviso !== "desconectado" && !enLlamadaRef.current) {
          setAbierto(true);
          setTab("cola");
          pitar();
        }
      } catch {
        // silencioso: se reintenta en el próximo tick
      }
    }
    revisarCola();
    const intervalo = setInterval(revisarCola, INTERVALO_CONTEXTO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  // Reloj de 1 s solo mientras se mira la cola (para que el tiempo de espera avance).
  useEffect(() => {
    if (tab !== "cola") return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [tab]);

  async function atenderDeCola(l: LlamadaEnCola) {
    setAtendiendo(l.id);
    setErrorCola("");
    try {
      const res = await fetch("/api/panel/cola/atender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ llamadaId: l.id, usuarioId: sesionAgente?.usuarioId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo atender la llamada.");
      // El softphone se conecta solo (autoContestar): aquí solo se refresca la lista.
      setCola((actual) => actual.filter((x) => x.id !== l.id));
    } catch (err) {
      setErrorCola(err instanceof Error ? err.message : "No se pudo atender la llamada.");
    } finally {
      setAtendiendo(null);
    }
  }

  function marcarVista(id: string) {
    if (vistasRef.current.includes(id)) return;
    vistasRef.current = [...vistasRef.current, id];
    setVistas(vistasRef.current);
    guardarVistas(vistasRef.current);
  }

  const sinVer = contexto.filter((c) => !vistas.includes(c.id)).length;
  const totalAvisos = sinVer + cola.length;

  function cerrarTodo() {
    if (sonando || enLlamada) return; // no cerrar en medio de una llamada
    setAbierto(false);
    setTab("marcar");
    setNumero("");
    setEstado("idle");
    setMensaje("");
  }

  function empezarCronometro() {
    setSegundos(0);
    cronoRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
  }

  function terminarLlamada(msg: string, ok: boolean) {
    limpiarTemporizadores();
    callSidRef.current = null;
    setEstado(ok ? "finalizada" : "error");
    setMensaje(msg);
    router.refresh();
    cargarDatos();
    setTimeout(() => {
      setEstado("idle");
      setMensaje("");
      setNumero("");
      setSegundos(0);
    }, 3500);
  }

  function monitorearLlamada(callSid: string) {
    callSidRef.current = callSid;
    // OJO: este intervalo debe seguir corriendo durante toda la llamada
    // (no solo hasta que conteste) — es la única forma en que el panel se
    // entera de que la llamada terminó y puede volver a dejar llamar.
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/llamada-estado?callSid=${encodeURIComponent(callSid)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        const llamada = data.llamada as LlamadaResumen | null;
        if (!llamada) return; // aún no llega el webhook de contestada

        if (llamada.estado === "en_curso" || llamada.estado === "transferida") {
          setEstado((prev) => {
            if (prev !== "en_curso") {
              empezarCronometro();
              return "en_curso";
            }
            return prev;
          });
        } else if (["completada", "fallida"].includes(llamada.estado)) {
          terminarLlamada(
            llamada.estado === "completada" ? "Llamada finalizada." : "La llamada no se completó.",
            llamada.estado === "completada"
          );
        }
      } catch {
        // silencioso: se reintenta en el próximo tick
      }
    }, 1500);
  }

  async function colgar() {
    // Llamada que entró por el softphone (transferida por la IA o por otro
    // agente): no hay una llamada "propia" que cortar por API, se cuelga la
    // pierna del navegador y la conferencia termina para todos.
    if (!callSidRef.current) {
      sp.colgar();
      return;
    }
    if (colgando) return;
    setColgando(true);
    try {
      await fetch("/api/colgar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callSid: callSidRef.current }),
      });
      // No hace falta esperar el webhook: la damos por terminada ya mismo,
      // el sondeo de arriba solo confirma cuando Twilio lo refleje en la BD.
      terminarLlamada("Llamada finalizada.", true);
    } finally {
      setColgando(false);
    }
  }

  async function llamar(num: string) {
    if (!num || estado === "marcando" || estado === "en_curso") return;
    setEstado("marcando");
    setMensaje("");
    try {
      const res = await fetch("/api/llamar-normal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ numero: num, colaId: colaId || undefined, usuarioId: sesionAgente?.usuarioId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error originando la llamada");
      router.refresh();
      if (data.callSid) {
        monitorearLlamada(data.callSid);
      } else {
        terminarLlamada("Llamando…", true);
      }
    } catch (err) {
      limpiarTemporizadores();
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
      setTimeout(() => {
        setEstado("idle");
        setMensaje("");
      }, 3500);
    }
  }

  async function abrirTransferir() {
    setMostrarTransferir(true);
    await sp.cargarAgentes();
  }

  const contactosFiltrados = contactos.filter((c) => {
    if (!busqueda) return true;
    const texto = `${c.nombre ?? ""} ${c.apellido ?? ""} ${c.numero}`.toLowerCase();
    return texto.includes(busqueda.toLowerCase());
  });

  // A quién se está atendiendo ahora: el número entrante (softphone) o el que
  // se marcó desde el panel.
  const numeroActivo = enLlamadaSoftphone || sonando ? sp.numeroEntrante : numero;
  const nombreLlamante = nombreDeContacto(numeroActivo, contactos);

  // Contexto de la IA que corresponde a esta llamada: el de ese número si
  // coincide, o la transferencia más reciente (que acaba de pasar).
  const contextoActual =
    (sonando || enLlamadaSoftphone
      ? (contexto.find((c) => sp.llamadaIdEntrante !== "" && c.id === sp.llamadaIdEntrante) ??
        contexto.find((c) => soloDigitos(c.numero).slice(-10) === soloDigitos(numeroActivo).slice(-10)) ??
        contexto.find((c) => idsVigentes.includes(c.id)))
      : undefined) ?? null;

  const subtitulo = sonando
    ? "Llamada entrante"
    : enLlamada
      ? estado === "marcando"
        ? "Marcando…"
        : `En llamada · ${formatCronometro(cronometro)}`
      : infoEstado.etiqueta;

  const anchoContexto = tab === "contexto" && !sonando && !enLlamada;

  return (
    <div
      className={
        esVentana
          ? "h-full"
          : "fixed inset-x-3 bottom-6 z-50 flex flex-col items-end gap-3 sm:inset-x-auto sm:bottom-8 sm:right-8"
      }
    >
      {abierto && (
        <div
          className={
            esVentana
              ? "flex h-full min-h-0 w-full flex-col bg-surface"
              : "w-full overflow-hidden rounded-3xl border border-edge bg-surface shadow-2xl shadow-slate-900/25 ring-1 ring-black/5 transition-[width] " +
                (anchoContexto ? "max-w-[24rem] sm:w-[24rem]" : "max-w-[20rem] sm:w-[20rem]")
          }
        >
          {/* Encabezado: quién soy, mi estado y mi actividad de hoy */}
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4 pb-3 pt-3.5">
            <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-indigo-500/25 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-violet-500/20 blur-2xl" />

            <div className="relative mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                <Phone size={11} /> Teléfono
              </span>
              <div className="flex items-center gap-2.5">
                <span
                  title={
                    sp.estado === "desconectado"
                      ? "El teléfono del navegador no está conectado: no podrás recibir llamadas aquí."
                      : "Teléfono del navegador conectado."
                  }
                  className={
                    "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium " +
                    (sp.estado === "desconectado" ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/15 text-emerald-300")
                  }
                >
                  <span className={"h-1.5 w-1.5 rounded-full " + (sp.estado === "desconectado" ? "bg-amber-400" : "bg-emerald-400")} />
                  {sp.estado === "desconectado" ? "Sin conexión" : "Conectado"}
                </span>
                {!esVentana && (
                  <button
                    type="button"
                    onClick={cerrarTodo}
                    disabled={sonando || enLlamada}
                    className="text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Cerrar"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            <div className="relative flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white ring-2 ring-offset-2 ring-offset-slate-900 transition-colors ${
                    enLlamada || sonando
                      ? "ring-emerald-400"
                      : presencia.estado === "disponible"
                        ? "ring-emerald-500"
                        : presencia.estado === "descanso"
                          ? "ring-amber-500"
                          : "ring-slate-500"
                  }`}
                >
                  {iniciales(nombreAsesor)}
                </span>
                {(enLlamada || sonando) && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{nombreAsesor}</p>
                <p className={`flex items-center gap-1.5 text-xs ${enLlamada || sonando ? "text-emerald-300" : "text-slate-300"}`}>
                  {!(enLlamada || sonando) && <span className={`h-1.5 w-1.5 rounded-full ${infoEstado.punto}`} />}
                  {subtitulo}
                </p>
              </div>
            </div>

            {actividadHoy && (
              <div className="relative mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-white/5 px-2 py-1.5">
                  <p className="text-sm font-semibold text-white">{actividadHoy.llamadas}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Llamadas hoy</p>
                </div>
                <div className="rounded-xl bg-white/5 px-2 py-1.5">
                  <p className="text-sm font-semibold text-white">{formatTiempoHablado(actividadHoy.segundos)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Hablando</p>
                </div>
              </div>
            )}

            {idAsesor && (
              <div className="relative mt-3">
                <SelectorEstadoAsesor
                  estado={presencia.estado}
                  cargando={presencia.cargando}
                  error={presencia.error}
                  onCambiar={presencia.cambiar}
                />
              </div>
            )}
          </div>

          {/* LLAMADA ENTRANTE */}
          {sonando && (
            <div className={"px-4 py-5 " + (esVentana ? "min-h-0 flex-1 overflow-y-auto" : "")}>
              <div className="text-center">
                <div className="relative mx-auto h-20 w-20">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
                  <span className="absolute inset-2 animate-pulse rounded-full bg-emerald-400/30" />
                  <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/40">
                    {nombreLlamante ? (
                      <span className="text-2xl font-semibold">{iniciales(nombreLlamante)}</span>
                    ) : (
                      <PhoneIncoming size={30} />
                    )}
                  </span>
                </div>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-600">
                  Llamada entrante
                </p>
                <p className="mt-0.5 truncate text-lg font-semibold text-ink">{nombreLlamante ?? sp.numeroEntrante}</p>
                {nombreLlamante && <p className="text-sm text-muted">{sp.numeroEntrante}</p>}
              </div>

              {contextoActual && (
                <div className="mt-4 max-h-56 overflow-y-auto">
                  <ContextoLlamada
                    item={contextoActual}
                    visto
                    compacto
                    onVisto={() => marcarVista(contextoActual.id)}
                    onLlamar={() => {}}
                  />
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={sp.rechazar}
                  className="flex items-center justify-center gap-2 rounded-full bg-red-50 py-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300"
                >
                  <PhoneOff size={16} /> Rechazar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (contextoActual) marcarVista(contextoActual.id);
                    sp.contestar();
                  }}
                  className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.02] active:scale-95"
                >
                  <Phone size={16} /> Contestar
                </button>
              </div>
            </div>
          )}

          {/* EN LLAMADA */}
          {!sonando && enLlamada && (
            <div className={"px-4 py-5 " + (esVentana ? "min-h-0 flex-1 overflow-y-auto" : "")}>
              <div className="text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-semibold text-white shadow-lg shadow-indigo-500/30">
                  {nombreLlamante ? iniciales(nombreLlamante) : <Phone size={24} />}
                </span>
                <p className="mt-3 truncate text-base font-semibold text-ink">
                  {nombreLlamante ?? (numeroActivo || "Llamada en curso")}
                </p>
                {nombreLlamante && numeroActivo && <p className="text-xs text-muted">{numeroActivo}</p>}
                <p className="mt-1 font-mono text-2xl font-semibold tracking-wider text-ink">
                  {estado === "marcando" ? "Marcando…" : formatCronometro(cronometro)}
                </p>
                {sp.enEspera && (
                  <span className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    Cliente en espera
                  </span>
                )}
              </div>

              {enLlamadaSoftphone && !mostrarTransferir && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <BotonControl
                    activo={sp.silenciado}
                    onClick={sp.alternarSilencio}
                    etiqueta={sp.silenciado ? "Activar mic" : "Silenciar"}
                    Icono={sp.silenciado ? MicOff : Mic}
                  />
                  <BotonControl
                    activo={sp.enEspera}
                    onClick={sp.alternarEspera}
                    etiqueta={sp.enEspera ? "Reanudar" : "En espera"}
                    Icono={sp.cargandoAccion ? Loader2 : sp.enEspera ? Play : Pause}
                    girando={sp.cargandoAccion}
                    deshabilitado={sp.cargandoAccion}
                  />
                  <BotonControl onClick={abrirTransferir} etiqueta="Transferir" Icono={ArrowRightLeft} />
                </div>
              )}

              {mostrarTransferir && (
                <div className="mt-4 rounded-2xl border border-edge p-3">
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
                  <div className="flex max-h-44 flex-col divide-y divide-edge overflow-y-auto">
                    {sp.agentes.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={async () => {
                          if (await sp.transferirA(a)) setMostrarTransferir(false);
                        }}
                        disabled={sp.transfiriendoA !== null}
                        className="flex items-center justify-between py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
                      >
                        {a.nombre}
                        {sp.transfiriendoA === a.id && <Loader2 size={13} className="animate-spin text-indigo-500" />}
                      </button>
                    ))}
                    {sp.agentes.length === 0 && (
                      <p className="py-3 text-center text-xs text-muted">No hay otros agentes.</p>
                    )}
                  </div>
                </div>
              )}

              {sp.mensaje && <p className="mt-3 text-center text-xs text-ink-2">{sp.mensaje}</p>}

              {contextoActual && (
                <div className="mt-4 max-h-48 overflow-y-auto">
                  <ContextoLlamada
                    item={contextoActual}
                    visto
                    compacto
                    onVisto={() => marcarVista(contextoActual.id)}
                    onLlamar={() => {}}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={colgar}
                disabled={colgando}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-red-500 to-red-600 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
              >
                {estado === "marcando" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Cancelar llamada
                  </>
                ) : (
                  <>
                    <PhoneOff size={16} /> Colgar
                  </>
                )}
              </button>
            </div>
          )}

          {/* LIBRE: pestañas */}
          {!sonando && !enLlamada && (
            <>
              {colas.length > 0 && tab === "marcar" && (
                <div className="shrink-0 px-4 pt-3">
                  <select
                    value={colaId}
                    onChange={(e) => setColaId(e.target.value)}
                    className="w-full rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Cola general (todos los agentes)</option>
                    {colas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Pantalla del "teléfono" (en la pestaña Contexto no hace falta) */}
              {tab !== "contexto" && tab !== "cola" && (
                <div className="shrink-0 px-4 py-4 text-center">
                  <input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value.replace(/[^\d+*#]/g, ""))}
                    placeholder="Número"
                    className="w-full bg-transparent text-center text-2xl font-semibold tracking-wide text-ink placeholder:text-muted focus:outline-none"
                  />
                  {numero && (
                    <button
                      type="button"
                      onClick={() => setNumero((n) => n.slice(0, -1))}
                      className="mt-1 text-muted hover:text-ink-2"
                      aria-label="Borrar"
                    >
                      <Delete size={16} className="mx-auto" />
                    </button>
                  )}
                </div>
              )}

              {/* Pestañas */}
              <div className="flex shrink-0 border-b border-t border-edge">
                {[
                  ...(cola.length > 0 || tab === "cola" ? [{ id: "cola" as Tab, label: "Cola", Icon: Hourglass }] : []),
                  ...(contextoActivo ? [{ id: "contexto" as Tab, label: "Contexto", Icon: ClipboardList }] : []),
                  { id: "marcar" as Tab, label: "Marcar", Icon: Phone },
                  { id: "contactos" as Tab, label: "Contactos", Icon: Users },
                  { id: "recientes" as Tab, label: "Recientes", Icon: History },
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={
                      "relative flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors " +
                      (tab === id ? "border-b-2 border-indigo-600 text-indigo-700" : "text-muted hover:text-ink-2")
                    }
                  >
                    <Icon size={15} />
                    {label}
                    {id === "cola" && cola.length > 0 && (
                      <span className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                        {cola.length}
                      </span>
                    )}
                    {id === "contexto" && sinVer > 0 && (
                      <span className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {sinVer}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div
                className={
                  "overflow-y-auto p-3 " +
                  (esVentana
                    ? "min-h-0 flex-1"
                    : tab === "contexto"
                      ? "max-h-[max(12rem,min(26rem,calc(100dvh-22rem)))]"
                      : "max-h-[max(10rem,min(18rem,calc(100dvh-26rem)))]")
                }
              >
                {tab === "cola" && (
                  <div className="flex flex-col gap-2.5">
                    {cola.map((l) => {
                      const espera = Math.max(0, l.espera_segundos + Math.floor(((ahora || colaRecibidaEn) - colaRecibidaEn) / 1000));
                      const nombreLlamada = l.contacto_nombre ?? nombreDeContacto(l.numero, contactos);
                      return (
                        <div key={l.id} className="rounded-2xl border border-edge p-3 text-left">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink">{nombreLlamada ?? l.numero}</p>
                              {nombreLlamada && <p className="text-xs text-muted">{l.numero}</p>}
                            </div>
                            <span
                              className={
                                "flex-shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold " +
                                (espera > 180
                                  ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300")
                              }
                            >
                              {formatCronometro(espera)}
                            </span>
                          </div>
                          {(l.motivo || l.solicitud) && (
                            <p className="mt-1.5 line-clamp-2 text-xs text-ink-2">{l.motivo ?? l.solicitud}</p>
                          )}
                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            {l.cola_nombre ? (
                              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">{l.cola_nombre}</span>
                            ) : (
                              <span />
                            )}
                            <button
                              type="button"
                              onClick={() => atenderDeCola(l)}
                              disabled={atendiendo !== null || enLlamada}
                              className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow shadow-emerald-500/30 transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-50"
                            >
                              {atendiendo === l.id ? <Loader2 size={13} className="animate-spin" /> : <Phone size={13} />}
                              Atender
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {errorCola && <p className="text-center text-xs text-red-600">{errorCola}</p>}
                    {cola.length === 0 && (
                      <p className="py-6 text-center text-xs text-muted">
                        No hay clientes esperando. Cuando no haya asesores activos, las llamadas transferidas por la IA
                        esperan aquí.
                      </p>
                    )}
                  </div>
                )}

                {tab === "contexto" && (
                  <div className="flex flex-col gap-3">
                    {contexto.map((c) => (
                      <ContextoLlamada
                        key={c.id}
                        item={c}
                        visto={vistas.includes(c.id)}
                        onVisto={() => marcarVista(c.id)}
                        onLlamar={(num) => {
                          marcarVista(c.id);
                          setNumero(num);
                          setTab("marcar");
                        }}
                      />
                    ))}
                    {contexto.length === 0 && (
                      <p className="py-6 text-center text-xs text-muted">
                        Cuando la IA te transfiera una llamada, aquí verás de qué se trata antes de contestar.
                      </p>
                    )}
                  </div>
                )}

                {tab === "marcar" && (
                  <div className="grid grid-cols-3 gap-2">
                    {TECLAS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNumero((n) => n + t)}
                        className="flex flex-col items-center justify-center rounded-xl border border-edge py-2 text-ink-2 transition-colors hover:bg-surface-2 active:scale-95 active:bg-surface-2"
                      >
                        <span className="text-lg font-medium leading-tight">{t}</span>
                        <span className="h-3 text-[9px] font-semibold leading-3 tracking-widest text-muted">{LETRAS[t] ?? ""}</span>
                      </button>
                    ))}
                  </div>
                )}

                {tab === "contactos" && (
                  <div className="flex flex-col gap-2">
                    <input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar contacto…"
                      className="rounded-md border border-edge px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex flex-col divide-y divide-edge">
                      {contactosFiltrados.map((c) => {
                        const nombreCompleto = [c.nombre, c.apellido].filter(Boolean).join(" ") || c.numero;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setNumero(c.numero);
                              setTab("marcar");
                            }}
                            className="flex items-center justify-between py-2 text-left text-sm hover:bg-surface-2"
                          >
                            <span>
                              <span className="block text-ink">{nombreCompleto}</span>
                              <span className="block text-xs text-muted">{c.numero}</span>
                            </span>
                            <Phone size={14} className="text-indigo-500" />
                          </button>
                        );
                      })}
                      {contactosFiltrados.length === 0 && (
                        <p className="py-4 text-center text-xs text-muted">Sin contactos.</p>
                      )}
                    </div>
                  </div>
                )}

                {tab === "recientes" && (
                  <div className="flex flex-col divide-y divide-edge">
                    {recientes.map((l) => {
                      const num = l.direccion === "entrante" ? l.numero_origen : l.numero_destino;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => {
                            setNumero(num);
                            setTab("marcar");
                          }}
                          className="flex items-center justify-between py-2 text-left text-sm hover:bg-surface-2"
                        >
                          <span>
                            <span className="block text-ink">{nombreDeContacto(num, contactos) ?? num}</span>
                            <span className="block text-xs capitalize text-muted">{l.direccion}</span>
                          </span>
                          <Phone size={14} className="text-indigo-500" />
                        </button>
                      );
                    })}
                    {recientes.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted">Sin llamadas recientes.</p>
                    )}
                  </div>
                )}
              </div>

              {tab !== "contexto" && tab !== "cola" && (
                <div className="shrink-0 border-t border-edge bg-surface p-3">
                  <button
                    type="button"
                    onClick={() => llamar(numero)}
                    disabled={!numero}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 py-2.5 text-sm font-medium text-white shadow shadow-emerald-500/30 transition-colors disabled:from-slate-300 disabled:to-slate-300 disabled:opacity-60"
                  >
                    <Phone size={16} />
                    Llamar
                  </button>
                  {estado === "finalizada" && <p className="mt-2 text-center text-xs text-emerald-600">{mensaje}</p>}
                  {estado === "error" && <p className="mt-2 text-center text-xs text-red-600">{mensaje}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Botón circular flotante */}
      {!abierto && !esVentana && (
        <div className="relative flex flex-col items-end gap-2">
          {enLlamada && (
            <button
              type="button"
              onClick={() => setAbierto(true)}
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-emerald-500/30"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              En llamada · {formatCronometro(cronometro)}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setAbierto(true);
              cargarDatos();
            }}
            aria-label={sonando ? "Llamada entrante: abrir panel" : "Abrir panel de llamadas"}
            className="ts-brand-button relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-indigo-500/40 transition-transform hover:scale-105 active:scale-95"
          >
            {sonando && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />}
            <Phone size={22} className={sonando ? "relative animate-bounce" : "relative"} />
            {idAsesor && (
              <span
                className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${infoEstado.punto}`}
                title={infoEstado.etiqueta}
              />
            )}
            {totalAvisos > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                {totalAvisos}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function BotonControl({
  etiqueta,
  Icono,
  onClick,
  activo = false,
  girando = false,
  deshabilitado = false,
}: {
  etiqueta: string;
  Icono: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  activo?: boolean;
  girando?: boolean;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={
        "flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-[11px] font-medium transition-colors disabled:opacity-50 " +
        (activo
          ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
          : "border-edge text-ink-2 hover:bg-surface-2")
      }
    >
      <Icono size={17} className={girando ? "animate-spin" : ""} />
      {etiqueta}
    </button>
  );
}
