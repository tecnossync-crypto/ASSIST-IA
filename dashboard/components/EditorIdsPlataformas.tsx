"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2, ShieldAlert, Pencil, Globe } from "lucide-react";
import { guardarIdsExternosAction } from "@/app/(app)/configuracion/agentes/actions";

const CAMPO =
  "rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

interface IdPlataforma {
  fuente: string;
  valor: string;
}

/**
 * Cómo identifica cada plataforma a este usuario. SalesIQ, el CRM y demás mandan su propio id en el campo `operador`
 * (o el propietario), y el mismo número puede ser de otra persona en otra plataforma. La solicitud trae su `origen`
 * (ej. "zoho-salesiq", "zoho-crm"): si contiene el nombre de una plataforma registrada aquí, el id se busca solo entre
 * los de esa plataforma. El "id general" vale para cualquier plataforma (y también se reconoce el email y el nombre exacto).
 */
export function EditorIdsPlataformas({
  id,
  idGeneral,
  idsIniciales,
}: {
  id: string;
  idGeneral: string | null;
  idsIniciales: IdPlataforma[];
}) {
  const [editando, setEditando] = useState(false);
  const [general, setGeneral] = useState(idGeneral ?? "");
  const [filas, setFilas] = useState<IdPlataforma[]>(idsIniciales);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, iniciar] = useTransition();

  function abrir() {
    setGeneral(idGeneral ?? "");
    setFilas(idsIniciales.length ? idsIniciales : []);
    setError(null);
    setEditando(true);
  }

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await guardarIdsExternosAction(id, filas, general.trim());
      if (r.error) setError(r.error);
      else setEditando(false);
    });
  }

  const hayAlgo = Boolean(idGeneral) || idsIniciales.length > 0;

  if (!editando) {
    return (
      <div className="flex flex-col gap-2">
        {hayAlgo ? (
          <div className="flex flex-wrap gap-1.5">
            {idGeneral && (
              <span className="inline-flex items-center gap-1 rounded-md border border-edge bg-slate-50 px-2 py-1 text-xs text-ink-2 dark:bg-white/5">
                <Globe size={11} className="text-muted" />
                <span className="text-muted">Cualquiera</span>
                <span className="font-mono">{idGeneral}</span>
              </span>
            )}
            {idsIniciales.map((i) => (
              <span
                key={`${i.fuente}:${i.valor}`}
                className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
              >
                <span className="font-medium capitalize">{i.fuente}</span>
                <span className="font-mono">{i.valor}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">Sin ids registrados: solo se reconoce por email o nombre exacto.</p>
        )}
        <button type="button" onClick={abrir} className="inline-flex w-fit items-center gap-1 text-xs font-medium text-indigo-700 hover:underline">
          <Pencil size={11} />
          {hayAlgo ? "Editar identificadores" : "Agregar identificadores"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-edge bg-slate-50/60 p-3 dark:bg-white/[0.03]">
      <div className="grid grid-cols-[110px_1fr_20px] items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span>Plataforma</span>
        <span>Id del usuario</span>
        <span />
      </div>

      <div className="grid grid-cols-[110px_1fr_20px] items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-ink-2">
          <Globe size={12} className="text-muted" />
          Cualquiera
        </span>
        <input className={CAMPO + " w-full"} placeholder="Id general (opcional)" value={general} onChange={(e) => setGeneral(e.target.value)} />
        <span />
      </div>

      {filas.map((f, i) => (
        <div key={i} className="grid grid-cols-[110px_1fr_20px] items-center gap-2">
          <input
            list="fuentes-ids"
            className={CAMPO + " w-full"}
            placeholder="salesiq"
            value={f.fuente}
            onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, fuente: e.target.value } : x)))}
          />
          <input
            className={CAMPO + " w-full"}
            placeholder="id en esa plataforma"
            value={f.valor}
            onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
          />
          <button type="button" aria-label="Quitar" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} className="text-muted hover:text-red-600">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <datalist id="fuentes-ids">
        <option value="salesiq" />
        <option value="crm" />
      </datalist>

      <button
        type="button"
        onClick={() => setFilas((fs) => [...fs, { fuente: fs.some((x) => x.fuente === "salesiq") ? "crm" : "salesiq", valor: "" }])}
        disabled={filas.length >= 10}
        className="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-edge px-2.5 py-1 text-xs text-ink-2 hover:border-indigo-300 disabled:opacity-50"
      >
        <Plus size={12} />
        Agregar plataforma
      </button>

      <p className="text-[11px] leading-relaxed text-muted">
        Escribe la plataforma como aparece en el <strong>origen</strong> de tus solicitudes (ej. <span className="font-mono">salesiq</span>,{" "}
        <span className="font-mono">crm</span>): basta con que el origen la contenga, así <span className="font-mono">zoho-salesiq</span> usa los ids de
        «salesiq».
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={enCurso}
          className="ts-brand-button inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {enCurso && <Loader2 size={12} className="animate-spin" />}
          Guardar
        </button>
        <button type="button" onClick={() => setEditando(false)} className="text-xs text-muted hover:underline">
          Cancelar
        </button>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <ShieldAlert size={12} /> {error}
        </p>
      )}
    </div>
  );
}
