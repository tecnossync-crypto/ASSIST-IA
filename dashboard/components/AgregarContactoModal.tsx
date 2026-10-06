"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, UserPlus, Phone, User, ListChecks, Calendar, Type, List } from "lucide-react";
import type { CampoPersonalizado } from "@/lib/api";
import { OverlayGuardando } from "./OverlayGuardando";

const INPUT =
  "w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

const ICONO_TIPO = { texto: Type, fecha: Calendar, dropdown: List } as const;

// Deja solo dígitos y un "+" inicial — así el número queda consistente sin
// importar cómo lo pegue quien lo carga (con espacios, guiones, paréntesis).
function limpiarNumero(valor: string): string {
  const soloDigitos = valor.replace(/[^\d]/g, "");
  return valor.trim().startsWith("+") ? `+${soloDigitos}` : soloDigitos;
}

export function AgregarContactoModal({ campos = [] }: { campos?: CampoPersonalizado[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [numero, setNumero] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<"idle" | "cargando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");
  const primerCampo = useRef<HTMLInputElement>(null);

  function cerrar() {
    setAbierto(false);
    setNumero("");
    setNombre("");
    setApellido("");
    setDatos({});
    setEstado("idle");
    setMensaje("");
  }

  useEffect(() => {
    if (!abierto) return;
    primerCampo.current?.focus();
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape" && estado !== "cargando") cerrar();
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto, estado]);

  // Mínimo 7 dígitos: lo bastante flexible para números locales y
  // internacionales, y evita guardar un contacto con un número vacío o roto.
  const digitos = numero.replace(/\D/g, "").length;
  const numeroValido = digitos >= 7;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!numeroValido) return;
    setEstado("cargando");
    try {
      const datosLlenos = Object.fromEntries(Object.entries(datos).filter(([, v]) => v.trim() !== ""));
      const res = await fetch("/api/contactos/importar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactos: [
            {
              numero: limpiarNumero(numero),
              nombre: nombre.trim() || undefined,
              apellido: apellido.trim() || undefined,
              datos: Object.keys(datosLlenos).length > 0 ? datosLlenos : undefined,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error agregando contacto");

      setEstado("ok");
      setMensaje("Contacto agregado correctamente.");
      router.refresh();
      setTimeout(cerrar, 1400);
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
      setTimeout(() => setEstado("idle"), 2500);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="ts-brand-button flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
      >
        <Plus size={15} />
        Agregar contacto
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => estado !== "cargando" && cerrar()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nuevo-contacto-titulo"
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-edge bg-surface shadow-2xl sm:rounded-2xl"
          >
            <OverlayGuardando
              estado={estado === "cargando" ? "guardando" : estado === "ok" ? "ok" : estado === "error" ? "error" : null}
              mensajeExito={mensaje}
              mensajeError={mensaje}
            />

            <div className="flex items-center gap-3 border-b border-edge px-5 py-4">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow shadow-indigo-500/30">
                <UserPlus size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="nuevo-contacto-titulo" className="text-sm font-semibold text-ink">
                  Nuevo contacto
                </h2>
                <p className="text-xs text-muted">El número es lo único obligatorio.</p>
              </div>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar"
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink-2"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={guardar} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <section className="flex flex-col gap-3">
                  <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <Phone size={12} /> Contacto
                  </h3>

                  <div className="flex flex-col gap-1">
                    <label htmlFor="modal_numero" className="text-xs font-medium text-ink-2">
                      Número de teléfono <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={primerCampo}
                      id="modal_numero"
                      type="tel"
                      inputMode="tel"
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      required
                      placeholder="+1 809 555 1234"
                      aria-invalid={numero !== "" && !numeroValido}
                      className={INPUT}
                    />
                    {numero !== "" && !numeroValido ? (
                      <p className="text-xs text-red-600">Escribe el número completo (mínimo 7 dígitos).</p>
                    ) : (
                      <p className="text-xs text-muted">Con código de país si es posible. Los espacios y guiones se quitan solos.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="modal_nombre" className="flex items-center gap-1 text-xs font-medium text-ink-2">
                        <User size={11} className="text-muted" /> Nombre
                      </label>
                      <input id="modal_nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="modal_apellido" className="text-xs font-medium text-ink-2">
                        Apellido
                      </label>
                      <input id="modal_apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} className={INPUT} />
                    </div>
                  </div>
                </section>

                {campos.length > 0 && (
                  <section className="mt-5 flex flex-col gap-3 border-t border-edge pt-4">
                    <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      <ListChecks size={12} /> Datos adicionales
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {campos.map((campo) => {
                        const tipo = campo.tipo ?? "texto";
                        const Icono = ICONO_TIPO[tipo] ?? Type;
                        const valor = datos[campo.nombre] ?? "";
                        const id = `modal_campo_${campo.nombre}`;
                        return (
                          <div key={campo.nombre} className="flex flex-col gap-1">
                            <label htmlFor={id} className="flex items-center gap-1 text-xs font-medium text-ink-2">
                              <Icono size={11} className="text-muted" />
                              <span className="truncate">{campo.nombre}</span>
                            </label>
                            {tipo === "dropdown" ? (
                              <select
                                id={id}
                                value={valor}
                                onChange={(e) => setDatos((prev) => ({ ...prev, [campo.nombre]: e.target.value }))}
                                className={INPUT}
                              >
                                <option value="">Seleccionar…</option>
                                {(campo.opciones ?? []).map((op) => (
                                  <option key={op} value={op}>
                                    {op}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id={id}
                                type={tipo === "fecha" ? "date" : "text"}
                                value={valor}
                                onChange={(e) => setDatos((prev) => ({ ...prev, [campo.nombre]: e.target.value }))}
                                placeholder={tipo === "texto" ? campo.descripcion || undefined : undefined}
                                className={INPUT}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-edge bg-surface-2/50 px-5 py-3">
                <button
                  type="button"
                  onClick={cerrar}
                  disabled={estado === "cargando"}
                  className="rounded-lg border border-edge px-4 py-2 text-sm text-ink-2 hover:bg-surface disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={estado === "cargando" || !numeroValido}
                  className="ts-brand-button rounded-lg px-5 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-50"
                >
                  Agregar contacto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
