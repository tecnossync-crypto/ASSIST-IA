"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Phone, Users, History, Loader2, CheckCircle2, Bot, User, X } from "lucide-react";
import type { ContactoResumen, LlamadaResumen } from "@/lib/api";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

type Tab = "marcar" | "contactos" | "recientes";
type Modo = "elegir" | "ia" | "normal";

export function PanelTelefono({
  contactos,
  recientes,
}: {
  contactos: ContactoResumen[];
  recientes: LlamadaResumen[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<Modo>("elegir");
  const [tab, setTab] = useState<Tab>("marcar");
  const [numero, setNumero] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<"idle" | "cargando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  function cerrarTodo() {
    setAbierto(false);
    setModo("elegir");
    setTab("marcar");
    setNumero("");
    setEstado("idle");
  }

  async function llamar(num: string) {
    if (!num) return;
    setEstado("cargando");
    setMensaje("");
    try {
      const endpoint = modo === "normal" ? "/api/llamar-normal" : "/api/llamar";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ numero: num }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error originando la llamada");
      setEstado("ok");
      setMensaje(`Llamando a ${num}…`);
      router.refresh();
      setTimeout(() => setEstado("idle"), 4000);
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  const contactosFiltrados = contactos.filter((c) => {
    if (!busqueda) return true;
    const texto = `${c.nombre ?? ""} ${c.apellido ?? ""} ${c.numero}`.toLowerCase();
    return texto.includes(busqueda.toLowerCase());
  });

  return (
    <>
      {/* Botón circular flotante */}
      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir panel de llamadas"
          className="ts-brand-button flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg shadow-indigo-500/40 transition-transform hover:scale-105"
        >
          <Phone size={20} />
        </button>
      )}

      {abierto && (
        <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl lg:w-72">
          {/* Encabezado */}
          <div className="flex items-center justify-between bg-gradient-to-br from-slate-900 to-indigo-950 px-4 py-3">
            <span className="text-sm font-medium text-white">
              {modo === "elegir" ? "Nueva llamada" : modo === "ia" ? "Llamada con IA" : "Llamada normal"}
            </span>
            <button type="button" onClick={cerrarTodo} className="text-slate-400 hover:text-white" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>

          {modo === "elegir" ? (
            <div className="flex flex-col gap-2 p-4">
              <button
                type="button"
                onClick={() => setModo("ia")}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                  <Bot size={16} />
                </span>
                <span>
                  <span className="block text-sm font-medium text-slate-800">Llamada con IA</span>
                  <span className="block text-xs text-slate-500">El agente contesta y lleva la conversación.</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setModo("normal")}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <User size={16} />
                </span>
                <span>
                  <span className="block text-sm font-medium text-slate-800">Llamada normal</span>
                  <span className="block text-xs text-slate-500">Conecta directo con un humano, sin IA.</span>
                </span>
              </button>
            </div>
          ) : (
            <>
              {/* Pantalla del "teléfono" */}
              <div className="px-4 py-4 text-center">
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value.replace(/[^\d+*#]/g, ""))}
                  placeholder="Número"
                  className="w-full bg-transparent text-center text-xl font-medium tracking-wide text-slate-800 placeholder:text-slate-300 focus:outline-none"
                />
                {numero && (
                  <button
                    type="button"
                    onClick={() => setNumero((n) => n.slice(0, -1))}
                    className="mt-1 text-slate-400 hover:text-slate-700"
                    aria-label="Borrar"
                  >
                    <Delete size={16} className="mx-auto" />
                  </button>
                )}
              </div>

              {/* Pestañas */}
              <div className="flex border-b border-t border-slate-100">
                {[
                  { id: "marcar" as Tab, label: "Marcar", Icon: Phone },
                  { id: "contactos" as Tab, label: "Contactos", Icon: Users },
                  { id: "recientes" as Tab, label: "Recientes", Icon: History },
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={
                      "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors " +
                      (tab === id ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-400 hover:text-slate-600")
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
                        className="rounded-xl border border-slate-200 py-3 text-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
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
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex flex-col divide-y divide-slate-100">
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
                            className="flex items-center justify-between py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <span>
                              <span className="block text-slate-800">{nombreCompleto}</span>
                              <span className="block text-xs text-slate-400">{c.numero}</span>
                            </span>
                            <Phone size={14} className="text-indigo-500" />
                          </button>
                        );
                      })}
                      {contactosFiltrados.length === 0 && (
                        <p className="py-4 text-center text-xs text-slate-400">Sin contactos.</p>
                      )}
                    </div>
                  </div>
                )}

                {tab === "recientes" && (
                  <div className="flex flex-col divide-y divide-slate-100">
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
                          className="flex items-center justify-between py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span>
                            <span className="block text-slate-800">{num}</span>
                            <span className="block text-xs capitalize text-slate-400">{l.direccion}</span>
                          </span>
                          <Phone size={14} className="text-indigo-500" />
                        </button>
                      );
                    })}
                    {recientes.length === 0 && (
                      <p className="py-4 text-center text-xs text-slate-400">Sin llamadas recientes.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 p-3">
                <div className="mb-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setModo("elegir")}
                    className="text-xs text-slate-400 hover:text-indigo-600"
                  >
                    ← cambiar tipo de llamada
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => llamar(numero)}
                  disabled={!numero || estado === "cargando"}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 py-2.5 text-sm font-medium text-white shadow shadow-emerald-500/30 disabled:opacity-50"
                >
                  <Phone size={16} />
                  Llamar
                </button>
                {estado === "cargando" && (
                  <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-indigo-600">
                    <Loader2 size={12} className="animate-spin" /> Originando llamada…
                  </p>
                )}
                {estado === "ok" && (
                  <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-green-600">
                    <CheckCircle2 size={12} /> {mensaje}
                  </p>
                )}
                {estado === "error" && <p className="mt-2 text-center text-xs text-red-600">{mensaje}</p>}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
