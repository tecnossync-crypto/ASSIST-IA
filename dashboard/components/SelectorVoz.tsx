"use client";

import { useState } from "react";

// Catálogo curado de voces en español comúnmente disponibles para Twilio
// ConversationRelay (Google / Amazon Polly, todas neurales). Verifica en la
// documentación de Twilio si necesitas una voz que no esté aquí — un id
// inválido hace fallar la llamada, por eso queda la opción "Personalizada".
const VOCES_RECOMENDADAS = [
  { id: "Google.es-US-Neural2-A", label: "Google · Español (EE. UU.) — Mujer A" },
  { id: "Google.es-US-Neural2-B", label: "Google · Español (EE. UU.) — Hombre B" },
  { id: "Google.es-ES-Neural2-A", label: "Google · Español (España) — Mujer A" },
  { id: "Google.es-ES-Neural2-B", label: "Google · Español (España) — Hombre B" },
  { id: "Amazon.Polly.Lupe-Neural", label: "Amazon Polly · Lupe (Español EE. UU., mujer)" },
  { id: "Amazon.Polly.Pedro-Neural", label: "Amazon Polly · Pedro (Español EE. UU., hombre)" },
  { id: "Amazon.Polly.Mia-Neural", label: "Amazon Polly · Mia (Español México, mujer)" },
];

export function SelectorVoz({ defaultValue }: { defaultValue: string | null }) {
  const esConocida = VOCES_RECOMENDADAS.some((v) => v.id === defaultValue);
  const [modo, setModo] = useState<"defecto" | "recomendada" | "personalizada">(
    !defaultValue ? "defecto" : esConocida ? "recomendada" : "personalizada"
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3 text-sm text-slate-600">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="voz_modo" checked={modo === "defecto"} onChange={() => setModo("defecto")} />
          Voz por defecto de Twilio
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="voz_modo"
            checked={modo === "recomendada"}
            onChange={() => setModo("recomendada")}
          />
          Elegir del catálogo
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="voz_modo"
            checked={modo === "personalizada"}
            onChange={() => setModo("personalizada")}
          />
          Escribir id manualmente
        </label>
      </div>

      {modo === "recomendada" && (
        <select
          name="voz_agente"
          defaultValue={esConocida ? (defaultValue as string) : VOCES_RECOMENDADAS[0].id}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {VOCES_RECOMENDADAS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      )}

      {modo === "personalizada" && (
        <input
          name="voz_agente"
          defaultValue={!esConocida ? (defaultValue ?? "") : ""}
          placeholder="Ej: Google.es-US-Neural2-C"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      )}

      {modo === "defecto" && <input type="hidden" name="voz_agente" value="" />}

      <p className="text-xs text-slate-400">
        Catálogo orientativo — confirma los ids exactos en la documentación de Twilio ConversationRelay antes de
        usarlos en producción.
      </p>
    </div>
  );
}
