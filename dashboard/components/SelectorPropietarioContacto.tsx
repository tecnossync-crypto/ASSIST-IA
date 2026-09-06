"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserCircle2, X } from "lucide-react";
import { guardarPropietarioAction } from "@/app/(app)/contactos/[id]/actions";
import { OverlayGuardando } from "./OverlayGuardando";
import type { Agente } from "@/lib/api";

// Campo de búsqueda para asignar el "propietario" de un contacto (reparto de
// cartera entre el equipo) — escribe para filtrar por nombre/email entre
// TODOS los agentes (admin/supervisor/operador), elige uno y se guarda solo.
export function SelectorPropietarioContacto({
  contactoId,
  agentes,
  valorInicial,
}: {
  contactoId: string;
  agentes: Agente[];
  valorInicial: { id: string; nombre: string } | null;
}) {
  const [seleccionado, setSeleccionado] = useState(valorInicial);
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function cerrarSiFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", cerrarSiFuera);
    return () => document.removeEventListener("mousedown", cerrarSiFuera);
  }, []);

  const filtrados = agentes.filter((a) => {
    const texto = `${a.nombre} ${a.email}`.toLowerCase();
    return texto.includes(query.toLowerCase());
  });

  async function elegir(agente: Agente | null) {
    setAbierto(false);
    setQuery("");
    setSeleccionado(agente ? { id: agente.id, nombre: agente.nombre } : null);
    setGuardando(true);
    const formData = new FormData();
    formData.set("contactoId", contactoId);
    if (agente) formData.set("propietarioUsuarioId", agente.id);
    await guardarPropietarioAction(formData);
    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  return (
    <div ref={ref} className="relative flex flex-col gap-2">
      <OverlayGuardando estado={guardando ? "guardando" : guardado ? "ok" : null} />

      {seleccionado && !abierto ? (
        <div className="flex w-fit items-center gap-2 rounded-full border border-edge bg-surface-2 px-3 py-1.5 text-sm text-ink">
          <UserCircle2 size={15} className="text-indigo-600" />
          {seleccionado.nombre}
          <button
            type="button"
            onClick={() => elegir(null)}
            className="text-muted hover:text-red-600"
            aria-label="Quitar propietario"
            title="Quitar propietario"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="relative w-full max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setAbierto(true)}
            placeholder="Buscar agente por nombre o email…"
            className="w-full rounded-md border border-edge py-2 pl-8 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}

      {abierto && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full max-w-xs overflow-hidden rounded-lg border border-edge bg-surface shadow-lg">
          <div className="max-h-56 overflow-y-auto py-1">
            {filtrados.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => elegir(a)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-2"
              >
                <UserCircle2 size={14} className="text-muted" />
                <span className="flex-1 truncate">{a.nombre}</span>
                <span className="text-xs text-muted">{a.email}</span>
              </button>
            ))}
            {filtrados.length === 0 && <p className="px-3 py-2 text-sm text-muted">Sin resultados.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
