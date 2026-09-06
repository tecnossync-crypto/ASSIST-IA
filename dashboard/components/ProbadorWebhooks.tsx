"use client";

import { useState } from "react";
import { FlaskConical, AlertTriangle } from "lucide-react";
import { probarWebhookAction } from "@/app/(app)/configuracion/integraciones/actions";
import type { EndpointWebhookPrueba } from "@/lib/api";

const ENDPOINTS: { valor: EndpointWebhookPrueba; etiqueta: string; advertencia: string }[] = [
  {
    valor: "llamar-agente",
    etiqueta: "Llamar a un agente (humano)",
    advertencia: "Esto SÍ origina una llamada real al número que pongas.",
  },
  {
    valor: "llamadas",
    etiqueta: "Llamar con IA",
    advertencia: "Esto SÍ origina una llamada real (contesta el agente de IA) al número que pongas.",
  },
  {
    valor: "contactos",
    etiqueta: "Actualizar datos de un contacto",
    advertencia: "Seguro de probar — solo crea/actualiza un contacto, no genera ninguna llamada.",
  },
];

export function ProbadorWebhooks() {
  const [endpoint, setEndpoint] = useState<EndpointWebhookPrueba>("contactos");
  const [numero, setNumero] = useState("");
  const [colaId, setColaId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [origen, setOrigen] = useState("prueba-dashboard");
  const [datosJson, setDatosJson] = useState('{\n  "nombre": "Juan"\n}');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ status: number; body: unknown } | null>(null);
  const [errorLocal, setErrorLocal] = useState("");

  const actual = ENDPOINTS.find((e) => e.valor === endpoint)!;

  async function enviar() {
    setErrorLocal("");
    setResultado(null);
    if (!numero.trim()) {
      setErrorLocal("Pon un número para probar.");
      return;
    }

    let payload: Record<string, unknown>;
    if (endpoint === "llamar-agente") {
      payload = { numero, ...(colaId.trim() ? { colaId } : {}), ...(origen.trim() ? { origen } : {}) };
    } else if (endpoint === "llamadas") {
      payload = { numero, ...(prompt.trim() ? { prompt } : {}), ...(origen.trim() ? { origen } : {}) };
    } else {
      try {
        payload = { numero, datos: JSON.parse(datosJson) };
      } catch {
        setErrorLocal('El campo "datos" debe ser JSON válido, ej. {"nombre": "Juan"}');
        return;
      }
    }

    setEnviando(true);
    try {
      const res = await probarWebhookAction(endpoint, payload);
      setResultado(res);
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <select
        value={endpoint}
        onChange={(e) => {
          setEndpoint(e.target.value as EndpointWebhookPrueba);
          setResultado(null);
          setErrorLocal("");
        }}
        className="w-fit rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {ENDPOINTS.map((e) => (
          <option key={e.valor} value={e.valor}>
            {e.etiqueta}
          </option>
        ))}
      </select>

      <p className="flex items-center gap-1.5 text-xs text-amber-700">
        <AlertTriangle size={13} className="flex-shrink-0" />
        {actual.advertencia}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Número, ej. +18095551234"
          className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {endpoint !== "contactos" && (
          <input
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            placeholder="origen (opcional)"
            className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        )}
        {endpoint === "llamar-agente" && (
          <input
            value={colaId}
            onChange={(e) => setColaId(e.target.value)}
            placeholder="colaId (opcional)"
            className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        )}
        {endpoint === "llamadas" && (
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="prompt (opcional)"
            className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        )}
        {endpoint === "contactos" && (
          <textarea
            value={datosJson}
            onChange={(e) => setDatosJson(e.target.value)}
            rows={3}
            className="rounded-md border border-edge px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:col-span-2"
          />
        )}
      </div>

      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="ts-brand-button flex w-fit items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
      >
        <FlaskConical size={14} />
        {enviando ? "Enviando…" : "Enviar prueba"}
      </button>

      {errorLocal && <p className="text-sm text-red-600">{errorLocal}</p>}

      {resultado && (
        <div className="rounded-md bg-slate-900 p-3">
          <p className={`mb-1 text-xs font-medium ${resultado.status < 300 ? "text-emerald-400" : "text-red-400"}`}>
            HTTP {resultado.status}
          </p>
          <pre className="overflow-x-auto text-xs text-slate-100">
            <code>{JSON.stringify(resultado.body, null, 2)}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
