"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Delete, Phone, PhoneOff, Users, History, Loader2, X } from "lucide-react";
import type { ContactoResumen, LlamadaResumen, Cola, TransferenciaContexto } from "@/lib/api";
import { useAgenteSoftphone } from "@/components/AgenteSoftphoneContext";
import { ContextoLlamada } from "@/components/ContextoLlamada";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

type Tab = "marcar" | "contactos" | "recientes" | "contexto";

// Cada cuánto se pregunta si la IA transfirió alguna llamada nueva, y qué tan
// reciente debe ser para que el panel se abra solo al cargar la página.
const INTERVALO_CONTEXTO_MS = 4000;
const RECIENTE_PARA_ABRIR_MS = 2 * 60 * 1000;
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
type EstadoLlamada = "idle" | "marcando" | "en_curso" | "finalizada" | "error";

function formatCronometro(segundos: number): string {
  const m = Math.floor(segundos / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(segundos % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function PanelTelefono({ autoAbrir = false }: { autoAbrir?: boolean } = {}) {
  const router = useRouter();
  // Si hay un agente identificado con PIN, la llamada debe timbrarle
  // SIEMPRE a él (ver backend: iniciarConferenciaConAgentes con
  // usuarioIdDirecto) — no al enrutamiento general de la cola, que es para
  // repartir entre varios, no para esto.
  const { sesion: sesionAgente } = useAgenteSoftphone();
  const [contactos, setContactos] = useState<ContactoResumen[]>([]);
  const [recientes, setRecientes] = useState<LlamadaResumen[]>([]);
  const [colas, setColas] = useState<Cola[]>([]);
  // autoAbrir: la ventana compacta de la extensión de Chrome (ver
  // app/extension-panel) no tiene otra cosa que mostrar, así que el panel
  // arranca abierto en vez de mostrar primero el botón circular flotante.
  const [abierto, setAbierto] = useState(autoAbrir);
  const [tab, setTab] = useState<Tab>("marcar");
  const [numero, setNumero] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [colaId, setColaId] = useState("");
  const [estado, setEstado] = useState<EstadoLlamada>("idle");
  const [mensaje, setMensaje] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [colgando, setColgando] = useState(false);
  const callSidRef = useRef<string | null>(null);

  // Contexto de llamadas que la IA transfirió (pestaña "Contexto").
  const [contexto, setContexto] = useState<TransferenciaContexto[]>([]);
  const [contextoActivo, setContextoActivo] = useState(false);
  const [vistas, setVistas] = useState<string[]>([]);
  // Ids ya conocidos en esta sesión; null hasta la primera respuesta, para no
  // abrir el panel por transferencias viejas al cargar la página.
  const conocidasRef = useRef<Set<string> | null>(null);
  const vistasRef = useRef<string[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cronoRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    revisar();
    const intervalo = setInterval(revisar, INTERVALO_CONTEXTO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  function marcarVista(id: string) {
    if (vistasRef.current.includes(id)) return;
    vistasRef.current = [...vistasRef.current, id];
    setVistas(vistasRef.current);
    guardarVistas(vistasRef.current);
  }

  const sinVer = contexto.filter((c) => !vistas.includes(c.id)).length;

  function cerrarTodo() {
    if (estado === "marcando" || estado === "en_curso") return; // no cerrar en medio de una llamada
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
    if (!callSidRef.current || colgando) return;
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

  const contactosFiltrados = contactos.filter((c) => {
    if (!busqueda) return true;
    const texto = `${c.nombre ?? ""} ${c.apellido ?? ""} ${c.numero}`.toLowerCase();
    return texto.includes(busqueda.toLowerCase());
  });

  const enLlamada = estado === "marcando" || estado === "en_curso";

  return (
    <div className="fixed inset-x-3 bottom-6 z-50 flex flex-col items-end gap-3 sm:inset-x-auto sm:bottom-8 sm:right-8">
      {abierto && (
        <div
          className={
            "w-full overflow-hidden rounded-3xl border border-edge bg-surface shadow-2xl shadow-slate-900/20 ring-1 ring-black/5 " +
            (tab === "contexto" ? "max-w-[24rem] sm:w-[24rem]" : "max-w-[19rem] sm:w-[19rem]")
          }
        >
          {/* Encabezado */}
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4 py-4">
            <div className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-indigo-500/20 blur-2xl" />
            <div className="relative flex items-center justify-between">
              <div>
                <span className="block text-sm font-semibold text-white">
                  {tab === "contexto" ? "Contexto de la llamada" : "Llamada normal"}
                </span>
                {enLlamada && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-300">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    {estado === "marcando" ? "Marcando…" : formatCronometro(segundos)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={cerrarTodo}
                disabled={enLlamada}
                className="text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <>
              {colas.length > 0 && tab !== "contexto" && (
                <div className="px-4 pt-3">
                  <select
                    value={colaId}
                    onChange={(e) => setColaId(e.target.value)}
                    disabled={enLlamada}
                    className="w-full rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
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
              <div className={"px-4 py-4 text-center " + (tab === "contexto" ? "hidden" : "")}>
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value.replace(/[^\d+*#]/g, ""))}
                  placeholder="Número"
                  disabled={enLlamada}
                  className="w-full bg-transparent text-center text-2xl font-semibold tracking-wide text-ink placeholder:text-muted focus:outline-none disabled:text-muted"
                />
                {numero && !enLlamada && (
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

              {/* Pestañas */}
              <div className="flex border-b border-t border-edge">
                {[
                  ...(contextoActivo ? [{ id: "contexto" as Tab, label: "Contexto", Icon: ClipboardList }] : []),
                  { id: "marcar" as Tab, label: "Marcar", Icon: Phone },
                  { id: "contactos" as Tab, label: "Contactos", Icon: Users },
                  { id: "recientes" as Tab, label: "Recientes", Icon: History },
                ].map(({ id, label, Icon }) => {
                  // En plena llamada se bloquean las pestañas de marcar, pero el
                  // contexto sigue a mano: justo ahí es cuando hace falta.
                  const bloqueada = enLlamada && id !== "contexto";
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => !bloqueada && setTab(id)}
                      disabled={bloqueada}
                      className={
                        "relative flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
                        (tab === id ? "border-b-2 border-indigo-600 text-indigo-700" : "text-muted hover:text-ink-2")
                      }
                    >
                      <Icon size={15} />
                      {label}
                      {id === "contexto" && sinVer > 0 && (
                        <span className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {sinVer}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className={"overflow-y-auto p-3 " + (tab === "contexto" ? "max-h-[26rem]" : "max-h-72")}>
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
                        disabled={enLlamada}
                        className="rounded-xl border border-edge py-3 text-lg font-medium text-ink-2 transition-colors hover:bg-surface-2 active:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t}
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
                            <span className="block text-ink">{num}</span>
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

              <div className={"border-t border-edge p-3 " + (tab === "contexto" && !enLlamada ? "hidden" : "")}>
                {enLlamada ? (
                  <button
                    type="button"
                    onClick={colgar}
                    disabled={colgando}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-red-500 to-red-600 py-2.5 text-sm font-medium text-white shadow shadow-red-500/30 transition-colors disabled:opacity-60"
                  >
                    {estado === "marcando" ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Marcando… (toca para cancelar)
                      </>
                    ) : (
                      <>
                        <PhoneOff size={16} />
                        Colgar · {formatCronometro(segundos)}
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => llamar(numero)}
                    disabled={!numero}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 py-2.5 text-sm font-medium text-white shadow shadow-emerald-500/30 transition-colors disabled:from-slate-300 disabled:to-slate-300 disabled:opacity-60"
                  >
                    <Phone size={16} />
                    Llamar
                  </button>
                )}
                {estado === "finalizada" && <p className="mt-2 text-center text-xs text-emerald-600">{mensaje}</p>}
                {estado === "error" && <p className="mt-2 text-center text-xs text-red-600">{mensaje}</p>}
              </div>
          </>
        </div>
      )}

      {/* Botón circular flotante */}
      {!abierto && (
        <button
          type="button"
          onClick={() => {
            setAbierto(true);
            cargarDatos();
          }}
          aria-label="Abrir panel de llamadas"
          className="ts-brand-button relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-indigo-500/40 transition-transform hover:scale-105 active:scale-95"
        >
          <Phone size={22} />
          {sinVer > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
              {sinVer}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
