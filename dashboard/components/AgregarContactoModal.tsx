"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import type { CampoPersonalizado } from "@/lib/api";
import { OverlayGuardando } from "./OverlayGuardando";

export function AgregarContactoModal({ campos = [] }: { campos?: CampoPersonalizado[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [numero, setNumero] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<"idle" | "cargando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  function cerrar() {
    setAbierto(false);
    setNumero("");
    setNombre("");
    setApellido("");
    setDatos({});
    setEstado("idle");
    setMensaje("");
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("cargando");
    try {
      const datosLlenos = Object.fromEntries(Object.entries(datos).filter(([, v]) => v.trim() !== ""));
      const res = await fetch("/api/contactos/importar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactos: [
            {
              numero,
              nombre: nombre || undefined,
              apellido: apellido || undefined,
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
        className="ts-brand-button flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
      >
        <Plus size={15} />
        Agregar contacto
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="relative w-full max-w-sm rounded-xl border border-edge bg-surface p-5 shadow-xl">
            <OverlayGuardando
              estado={estado === "cargando" ? "guardando" : estado === "ok" ? "ok" : estado === "error" ? "error" : null}
              mensajeExito={mensaje}
              mensajeError={mensaje}
            />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Nuevo contacto</h2>
              <button type="button" onClick={cerrar} className="text-muted hover:text-ink-2">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={guardar} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="modal_numero" className="text-xs font-medium text-ink-2">
                  Número *
                </label>
                <input
                  id="modal_numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  required
                  placeholder="+18095551234"
                  className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="modal_nombre" className="text-xs font-medium text-ink-2">
                    Nombre
                  </label>
                  <input
                    id="modal_nombre"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="modal_apellido" className="text-xs font-medium text-ink-2">
                    Apellido
                  </label>
                  <input
                    id="modal_apellido"
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {campos.length > 0 && (
                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                  {campos.map((campo) => {
                    const tipo = campo.tipo ?? "texto";
                    const valor = datos[campo.nombre] ?? "";
                    return (
                      <div key={campo.nombre} className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-ink-2">{campo.nombre}</label>
                        {tipo === "dropdown" ? (
                          <select
                            value={valor}
                            onChange={(e) => setDatos((prev) => ({ ...prev, [campo.nombre]: e.target.value }))}
                            className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">—</option>
                            {(campo.opciones ?? []).map((op) => (
                              <option key={op} value={op}>
                                {op}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={tipo === "fecha" ? "date" : "text"}
                            value={valor}
                            onChange={(e) => setDatos((prev) => ({ ...prev, [campo.nombre]: e.target.value }))}
                            placeholder={tipo === "texto" ? campo.descripcion || undefined : undefined}
                            className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-1">
                <button
                  type="submit"
                  disabled={estado === "cargando"}
                  className="ts-brand-button rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
                >
                  Agregar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
