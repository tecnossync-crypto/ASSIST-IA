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

export interface EtiquetaDisponible {
  nombre: string;
  color?: string;
}

export interface EmpresaConfig {
  id: string;
  nombre: string;
  guion_agente: GuionAgente;
  numeros_transferencia: string[];
  voz_agente: string | null;
  campos_personalizados: CampoPersonalizado[];
  etiquetas_disponibles: EtiquetaDisponible[];
  duracion_maxima_llamada_segundos: number;
  timeout_timbrado_segundos: number;
  tiempo_respuesta_segundos: number;
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
  etiquetas_disponibles: EtiquetaDisponible[];
  duracion_maxima_llamada_segundos: number;
  timeout_timbrado_segundos: number;
  tiempo_respuesta_segundos: number;
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
  programada_para: string | null;
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
    programada_para: string | null;
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
  programadaPara?: string | null;
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

export interface ContactoResumen {
  id: string;
  numero: string;
  nombre: string | null;
  apellido: string | null;
  datos: Record<string, string>;
  etiquetas: string[];
  creado_en: string;
  actualizado_en: string;
}

export interface ContactoDetalle {
  contacto: ContactoResumen & { notas: string | null };
  llamadas: {
    id: string;
    direccion: "entrante" | "saliente";
    estado: string;
    duracion_segundos: number | null;
    iniciada_en: string;
  }[];
}

export async function listarContactos(q?: string): Promise<ContactoResumen[]> {
  const url = new URL("/api/contactos", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  if (q) url.searchParams.set("q", q);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error listando contactos: HTTP ${res.status}`);
  const data = await res.json();
  return data.contactos;
}

export async function obtenerContacto(id: string): Promise<ContactoDetalle> {
  const res = await fetch(new URL(`/api/contactos/${id}`, BACKEND_URL), { cache: "no-store" });
  if (!res.ok) throw new Error(`Error obteniendo contacto: HTTP ${res.status}`);
  return res.json();
}

export async function actualizarEtiquetasContacto(id: string, etiquetas: string[]): Promise<void> {
  const res = await fetch(new URL(`/api/contactos/${id}/etiquetas`, BACKEND_URL), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ etiquetas }),
  });
  if (!res.ok) throw new Error(`Error actualizando etiquetas: HTTP ${res.status}`);
}

export async function importarContactos(
  contactos: { numero: string; nombre?: string; apellido?: string }[]
): Promise<{ insertados: number; actualizados: number }> {
  const res = await fetch(new URL("/api/contactos/importar", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, contactos }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error importando contactos: HTTP ${res.status}`);
  }
  return res.json();
}

export type DisparadorFlujo = "llamada_completada" | "llamada_no_contesta" | "llamada_transferida";
export type AccionFlujo = "agregar_etiqueta" | "crear_solicitud";

export interface FlujoTrabajo {
  id: string;
  nombre: string;
  disparador: DisparadorFlujo;
  accion: AccionFlujo;
  accion_datos: { etiqueta?: string; tipo?: string; descripcion?: string };
  activo: boolean;
  creado_en: string;
}

export async function listarFlujosTrabajo(): Promise<FlujoTrabajo[]> {
  const url = new URL("/api/flujos-trabajo", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error listando flujos: HTTP ${res.status}`);
  const data = await res.json();
  return data.flujos;
}

export async function crearFlujoTrabajo(data: {
  nombre: string;
  disparador: DisparadorFlujo;
  accion: AccionFlujo;
  accionDatos: Record<string, string>;
}): Promise<void> {
  const res = await fetch(new URL("/api/flujos-trabajo", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, ...data }),
  });
  if (!res.ok) throw new Error(`Error creando flujo: HTTP ${res.status}`);
}

export async function activarFlujoTrabajo(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/flujos-trabajo/${id}/activar`, BACKEND_URL), { method: "POST" });
  if (!res.ok) throw new Error(`Error activando flujo: HTTP ${res.status}`);
}

export async function desactivarFlujoTrabajo(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/flujos-trabajo/${id}/desactivar`, BACKEND_URL), { method: "POST" });
  if (!res.ok) throw new Error(`Error desactivando flujo: HTTP ${res.status}`);
}

export async function eliminarFlujoTrabajo(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/flujos-trabajo/${id}`, BACKEND_URL), { method: "DELETE" });
  if (!res.ok) throw new Error(`Error eliminando flujo: HTTP ${res.status}`);
}
