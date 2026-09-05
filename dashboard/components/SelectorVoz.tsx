"use client";

import { useState } from "react";
import { Mic } from "lucide-react";

// Catálogo verificado contra la documentación oficial de Twilio
// (ConversationRelay necesita "ttsProvider" + "voice" como atributos
// SEPARADOS — antes se guardaban mezclados en un solo string inválido, por
// eso la voz elegida nunca se aplicaba).
const VOCES_RECOMENDADAS = [
  { provider: "google", voice: "es-US-Neural2-A", label: "Google · Español (EE. UU.) — Mujer" },
  { provider: "google", voice: "es-US-Neural2-B", label: "Google · Español (EE. UU.) — Hombre" },
  { provider: "google", voice: "es-ES-Neural2-G", label: "Google · Español (España) — Mujer" },
  { provider: "google", voice: "es-ES-Neural2-H", label: "Google · Español (España) — Hombre" },
  { provider: "amazon", voice: "Lupe-Neural", label: "Amazon Polly · Lupe (Español EE. UU., mujer)" },
  { provider: "amazon", voice: "Pedro-Neural", label: "Amazon Polly · Pedro (Español EE. UU., hombre)" },
  { provider: "amazon", voice: "Mia-Neural", label: "Amazon Polly · Mia (Español México, mujer)" },
  { provider: "amazon", voice: "Andres-Neural", label: "Amazon Polly · Andrés (Español México, hombre)" },
  { provider: "amazon", voice: "Lucia-Neural", label: "Amazon Polly · Lucía (Español España, mujer)" },
  { provider: "amazon", voice: "Sergio-Neural", label: "Amazon Polly · Sergio (Español España, hombre)" },
] as const;

function claveDe(provider: string, voice: string) {
  return `${provider}::${voice}`;
}

export function SelectorVoz({
  defaultValue,
  defaultProvider,
}: {
  defaultValue: string | null;
  defaultProvider: string | null;
}) {
  const esConocida = VOCES_RECOMENDADAS.some((v) => v.provider === defaultProvider && v.voice === defaultValue);
  const esClonada = defaultProvider === "elevenlabs" && !!defaultValue;
  const [modo, setModo] = useState<"defecto" | "recomendada" | "personalizada" | "clonada">(
    esClonada ? "clonada" : !defaultValue ? "defecto" : esConocida ? "recomendada" : "personalizada"
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3 text-sm text-slate-600">
        {esClonada && (
          <label className="flex items-center gap-1.5">
            <input type="radio" name="voz_modo" checked={modo === "clonada"} onChange={() => setModo("clonada")} />
            Voz clonada activa
          </label>
        )}
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
          Escribir manualmente
        </label>
      </div>

      {modo === "clonada" && (
        <div className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-700">
          <Mic size={14} />
          Usando la voz clonada en ElevenLabs (id: {defaultValue}). Para cambiarla, sube un audio nuevo abajo o
          elige otra opción aquí.
          <input type="hidden" name="voz_agente" value={defaultValue ?? ""} />
          <input type="hidden" name="tts_provider" value="elevenlabs" />
        </div>
      )}

      {modo === "recomendada" && (
        <select
          defaultValue={esConocida ? claveDe(defaultProvider as string, defaultValue as string) : claveDe(VOCES_RECOMENDADAS[0].provider, VOCES_RECOMENDADAS[0].voice)}
          onChange={(e) => {
            const [provider, voice] = e.target.value.split("::");
            const form = e.target.form;
            if (form) {
              (form.elements.namedItem("voz_agente") as HTMLInputElement).value = voice;
              (form.elements.namedItem("tts_provider") as HTMLInputElement).value = provider;
            }
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {VOCES_RECOMENDADAS.map((v) => (
            <option key={claveDe(v.provider, v.voice)} value={claveDe(v.provider, v.voice)}>
              {v.label}
            </option>
          ))}
        </select>
      )}

      {modo === "personalizada" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Proveedor</label>
            <select
              name="tts_provider"
              defaultValue={!esConocida ? (defaultProvider ?? "google") : "google"}
              className="rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="google">Google</option>
              <option value="amazon">Amazon</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Nombre de voz</label>
            <input
              name="voz_agente"
              defaultValue={!esConocida ? (defaultValue ?? "") : ""}
              placeholder="Ej: Pedro-Neural"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      {/* Campos ocultos reales que viajan en el form — el <select> del
          catálogo los rellena por JS al elegir una opción. */}
      {modo !== "personalizada" && modo !== "clonada" && (
        <>
          <input
            type="hidden"
            name="voz_agente"
            value={modo === "defecto" ? "" : esConocida ? (defaultValue ?? VOCES_RECOMENDADAS[0].voice) : VOCES_RECOMENDADAS[0].voice}
          />
          <input
            type="hidden"
            name="tts_provider"
            value={modo === "defecto" ? "" : esConocida ? (defaultProvider ?? VOCES_RECOMENDADAS[0].provider) : VOCES_RECOMENDADAS[0].provider}
          />
        </>
      )}

      <p className="text-xs text-slate-400">Catálogo verificado contra la documentación de Twilio ConversationRelay.</p>
    </div>
  );
}
