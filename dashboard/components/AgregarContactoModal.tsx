"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, CheckCircle2 } from "lucide-react";

export function AgregarContactoModal() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [numero, setNumero] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [estado, setEstado] = useState<"idle" | "cargando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  function cerrar() {
    setAbierto(false);
    setNumero("");
    setNombre("");
    setApellido("");
    setEstado("idle");
    setMensaje("");
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("cargando");
    try {
      const res = await fetch("/api/contactos/importar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactos: [{ numero, nombre: nombre || undefined, apellido: apellido || undefined }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error agregando contacto");

      setEstado("ok");
      setMensaje("Contacto agregado correctamente.");
      router.refresh();
      setTimeout(cerrar, 1200);
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "Error desconocido");
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
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Nuevo contacto</h2>
              <button type="button" onClick={cerrar} className="text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={guardar} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="modal_numero" className="text-xs font-medium text-slate-600">
                  Número *
                </label>
                <input
                  id="modal_numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  required
                  placeholder="+18095551234"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="modal_nombre" className="text-xs font-medium text-slate-600">
                    Nombre
                  </label>
                  <input
                    id="modal_nombre"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="modal_apellido" className="text-xs font-medium text-slate-600">
                    Apellido
                  </label>
                  <input
                    id="modal_apellido"
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="mt-1 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={estado === "cargando"}
                  className="ts-brand-button rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
                >
                  {estado === "cargando" ? "Guardando…" : "Agregar"}
                </button>
                {estado === "cargando" && (
                  <span className="flex items-center gap-1 text-xs text-indigo-600">
                    <Loader2 size={12} className="animate-spin" /> Aplicando…
                  </span>
                )}
                {estado === "ok" && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 size={12} /> {mensaje}
                  </span>
                )}
                {estado === "error" && <span className="text-xs text-red-600">{mensaje}</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
