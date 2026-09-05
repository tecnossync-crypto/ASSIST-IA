"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Phone, PhoneOff, Users, History, Loader2, X } from "lucide-react";
import type { ContactoResumen, LlamadaResumen, Cola } from "@/lib/api";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

type Tab = "marcar" | "contactos" | "recientes";
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

export function PanelTelefono({
  contactos,
  recientes,
  colas,
}: {
  contactos: ContactoResumen[];
  recientes: LlamadaResumen[];
  colas: Cola[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tab, setTab] = useState<Tab>("marcar");
  const [numero, setNumero] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [colaId, setColaId] = useState("");
  const [estado, setEstado] = useState<EstadoLlamada>("idle");
  const [mensaje, setMensaje] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [colgando, setColgando] = useState(false);
  const callSidRef = useRef<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cronoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function limpiarTemporizadores() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (cronoRef.current) clearInterval(cronoRef.current);
    pollRef.current = null;
    cronoRef.current = null;
  }

  useEffect(() => () => limpiarTemporizadores(), []);

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
        body: JSON.stringify({ numero: num, colaId: colaId || undefined }),
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
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 sm:bottom-8 sm:right-8">
      {abierto && (
        <div className="w-[19rem] overflow-hidden rounded-3xl border border-edge bg-surface shadow-2xl shadow-slate-900/20 ring-1 ring-black/5">
          {/* Encabezado */}
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4 py-4">
            <div className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-indigo-500/20 blur-2xl" />
            <div className="relative flex items-center justify-between">
              <div>
                <span className="block text-sm font-semibold text-white">Llamada normal</span>
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
              {colas.length > 0 && (
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

              {/* Pantalla del "teléfono" */}
              <div className="px-4 py-4 text-center">
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
                  { id: "marcar" as Tab, label: "Marcar", Icon: Phone },
                  { id: "contactos" as Tab, label: "Contactos", Icon: Users },
                  { id: "recientes" as Tab, label: "Recientes", Icon: History },
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => !enLlamada && setTab(id)}
                    disabled={enLlamada}
                    className={
                      "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
                      (tab === id ? "border-b-2 border-indigo-600 text-indigo-700" : "text-muted hover:text-ink-2")
                    }
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>

              <div className="max-h-72 overflow-y-auto p-3">
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

              <div className="border-t border-edge p-3">
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
          onClick={() => setAbierto(true)}
          aria-label="Abrir panel de llamadas"
          className="ts-brand-button relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-indigo-500/40 transition-transform hover:scale-105 active:scale-95"
        >
          <Phone size={22} />
        </button>
      )}
    </div>
  );
}
