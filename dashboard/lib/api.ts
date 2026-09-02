/**
 * Cliente hacia el backend. Fase 1: sin auth todavía, así que se asume un
 * solo tenant vía NEXT_PUBLIC_EMPRESA_ID — TODO reemplazar por sesión real
 * en cuanto exista login (tabla `usuarios`).
 */

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
export const EMPRESA_ID = process.env.NEXT_PUBLIC_EMPRESA_ID ?? "";

export interface LlamadaResumen {
  id: string;
  call_sid: string;
  direccion: "entrante" | "saliente";
  numero_origen: string;
  numero_destino: string;
  estado: string;
  transferida: boolean;
  duracion_segundos: number | null;
  iniciada_en: string;
  finalizada_en: string | null;
  resumen_motivo: string | null;
  resumen_solicitud: string | null;
  resumen_resultado: string | null;
  accion_pendiente: string | null;
}

export interface LlamadaDetalle {
  llamada: {
    id: string;
    call_sid: string;
    direccion: "entrante" | "saliente";
    numero_origen: string;
    numero_destino: string;
    estado: string;
    transferida: boolean;
    transferencia_destino: string | null;
    duracion_segundos: number | null;
    iniciada_en: string;
    finalizada_en: string | null;
  };
  transcripcion: {
    texto_completo: { hablante: string; texto: string; timestamp: string }[];
    resumen_motivo: string | null;
    resumen_solicitud: string | null;
    resumen_resultado: string | null;
    accion_pendiente: string | null;
  } | null;
  grabacion: {
    url_storage: string;
    duracion_segundos: number | null;
    hash_integridad: string;
    audioUrl: string | null;
  } | null;
  datos: { campo: string; valor: string }[];
}

export async function listarLlamadas(params: {
  q?: string;
  estado?: string;
  limite?: number;
  offset?: number;
}): Promise<LlamadaResumen[]> {
  const url = new URL("/api/llamadas", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  if (params.q) url.searchParams.set("q", params.q);
  if (params.estado) url.searchParams.set("estado", params.estado);
  if (params.limite) url.searchParams.set("limite", String(params.limite));
  if (params.offset) url.searchParams.set("offset", String(params.offset));

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error listando llamadas: HTTP ${res.status}`);
  const data = await res.json();
  return data.llamadas;
}

export async function obtenerLlamada(id: string): Promise<LlamadaDetalle> {
  const res = await fetch(new URL(`/api/llamadas/${id}`, BACKEND_URL), { cache: "no-store" });
  if (!res.ok) throw new Error(`Error obteniendo llamada: HTTP ${res.status}`);
  return res.json();
}

export interface GuionAgente {
  prompt_personalizado?: string;
  saludo?: string;
  que_resuelve?: string;
  datos_a_tomar?: string[];
  cuando_transferir?: string;
  instrucciones_extra?: string;
}

export interface CampoPersonalizado {
  nombre: string;
  descripcion?: string;
}

export interface EmpresaConfig {
  id: string;
  nombre: string;
  guion_agente: GuionAgente;
  numeros_transferencia: string[];
  voz_agente: string | null;
  campos_personalizados: CampoPersonalizado[];
}

export async function obtenerEmpresa(): Promise<EmpresaConfig> {
  const url = new URL("/api/empresa", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error obteniendo empresa: HTTP ${res.status}`);
  return res.json();
}

export async function actualizarEmpresa(data: {
  nombre: string;
  guion_agente: GuionAgente;
  numeros_transferencia: string[];
  voz_agente: string | null;
  campos_personalizados: CampoPersonalizado[];
}): Promise<void> {
  const res = await fetch(new URL("/api/empresa", BACKEND_URL), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, ...data }),
  });
  if (!res.ok) throw new Error(`Error actualizando empresa: HTTP ${res.status}`);
}

export async function iniciarLlamadaSaliente(numero: string): Promise<{ callSid: string }> {
  const res = await fetch(new URL("/api/llamadas/salientes", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, numero }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error originando llamada: HTTP ${res.status}`);
  }
  return res.json();
}

export interface CampanaResumen {
  id: string;
  nombre: string;
  estado: "borrador" | "en_curso" | "pausada" | "completada";
  reintentos_max: number;
  horas_entre_reintentos: number;
  creado_en: string;
  total_contactos: string;
  completados: string;
  fallidos: string;
  pendientes: string;
  llamando: string;
}

export interface CampanaContacto {
  id: string;
  numero: string;
  nombre: string | null;
  estado: "pendiente" | "llamando" | "completada" | "fallida";
  intentos: number;
  ultima_llamada_id: string | null;
  proximo_intento_en: string;
  creado_en: string;
}

export interface CampanaDetalle {
  campana: {
    id: string;
    empresa_id: string;
    nombre: string;
    estado: CampanaResumen["estado"];
    reintentos_max: number;
    horas_entre_reintentos: number;
    guion_override: GuionAgente | null;
    creado_en: string;
  };
  contactos: CampanaContacto[];
}

export async function listarCampanas(): Promise<CampanaResumen[]> {
  const url = new URL("/api/campanas", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error listando campañas: HTTP ${res.status}`);
  const data = await res.json();
  return data.campanas;
}

export async function crearCampana(data: {
  nombre: string;
  contactos: { numero: string; nombre?: string }[];
  reintentosMax: number;
  horasEntreReintentos: number;
  guionOverride?: GuionAgente | null;
}): Promise<{ campanaId: string }> {
  const res = await fetch(new URL("/api/campanas", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, ...data }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error creando campaña: HTTP ${res.status}`);
  }
  return res.json();
}

export async function obtenerCampana(id: string): Promise<CampanaDetalle> {
  const res = await fetch(new URL(`/api/campanas/${id}`, BACKEND_URL), { cache: "no-store" });
  if (!res.ok) throw new Error(`Error obteniendo campaña: HTTP ${res.status}`);
  return res.json();
}

export async function iniciarCampana(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/campanas/${id}/iniciar`, BACKEND_URL), { method: "POST" });
  if (!res.ok) throw new Error(`Error iniciando campaña: HTTP ${res.status}`);
}

export interface Resumen {
  llamadas_hoy: string;
  llamadas_activas: string;
  transferidas_hoy: string;
  entrantes_hoy: string;
  salientes_hoy: string;
  campanas_activas: string;
}

export async function obtenerResumen(): Promise<Resumen> {
  const url = new URL("/api/resumen", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error obteniendo resumen: HTTP ${res.status}`);
  return res.json();
}

export async function pausarCampana(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/campanas/${id}/pausar`, BACKEND_URL), { method: "POST" });
  if (!res.ok) throw new Error(`Error pausando campaña: HTTP ${res.status}`);
}
