import type { EmpresaConfig } from "./types.js";

const BASE_URL = process.env.BACKEND_INTERNAL_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function assertConfigured() {
  if (!BASE_URL || !INTERNAL_API_KEY) {
    throw new Error("BACKEND_INTERNAL_URL o INTERNAL_API_KEY no están configurados");
  }
}

async function internalFetch(path: string, init: RequestInit = {}) {
  assertConfigured();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-internal-key": INTERNAL_API_KEY as string,
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Backend interno respondió ${res.status} en ${path}: ${body}`);
  }

  return res;
}

export async function getEmpresaConfig(empresaId: string, numeroCliente?: string): Promise<EmpresaConfig> {
  const query = numeroCliente ? `?numero=${encodeURIComponent(numeroCliente)}` : "";
  const res = await internalFetch(`/internal/empresas/${empresaId}/config-agente${query}`);
  return (await res.json()) as EmpresaConfig;
}

// Cuando la llamada viene de una campaña, el guion_override de la campaña
// pisa (shallow merge) el guion_agente normal de la empresa.
export async function getEmpresaConfigDeCampana(campanaContactoId: string): Promise<EmpresaConfig> {
  const res = await internalFetch(`/internal/campana-contactos/${campanaContactoId}/config-agente`);
  return (await res.json()) as EmpresaConfig;
}

// Cuando la llamada la pidió una plataforma externa vía webhook, su prompt
// (si mandó uno) pisa el prompt_personalizado normal de la empresa.
export async function getEmpresaConfigDeWebhook(llamadaWebhookId: string): Promise<EmpresaConfig> {
  const res = await internalFetch(`/internal/llamadas-webhook/${llamadaWebhookId}/config-agente`);
  return (await res.json()) as EmpresaConfig;
}

export async function marcarTransferencia(callSid: string) {
  await internalFetch(`/internal/llamadas/${callSid}/transferir`, { method: "POST" });
}

export async function guardarTranscripcion(
  callSid: string,
  data: {
    textoCompleto: unknown;
    resumenMotivo?: string;
    resumenSolicitud?: string;
    resumenResultado?: string;
    accionPendiente?: string;
    satisfaccion?: "positiva" | "neutral" | "negativa";
  }
) {
  await internalFetch(`/internal/llamadas/${callSid}/transcripcion`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function registrarSolicitud(
  callSid: string,
  data: { tipo?: string; descripcion?: string }
) {
  await internalFetch(`/internal/llamadas/${callSid}/solicitud`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function registrarDato(callSid: string, campo: string, valor: string) {
  await internalFetch(`/internal/llamadas/${callSid}/dato`, {
    method: "POST",
    body: JSON.stringify({ campo, valor }),
  });
}
