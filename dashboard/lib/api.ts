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

export interface LlamadaActiva {
  id: string;
  direccion: "entrante" | "saliente";
  numero_origen: string;
  numero_destino: string;
  iniciada_en: string;
  agente_call_sid: string | null;
  cola_id: string | null;
  cola_nombre: string | null;
  agente_id: string | null;
  agente_nombre: string | null;
}

export async function listarLlamadasActivas(): Promise<LlamadaActiva[]> {
  const url = new URL("/api/llamadas/activas", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error listando llamadas activas: HTTP ${res.status}`);
  const data = await res.json();
  return data.llamadas;
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
    cola_id: string | null;
    conferencia_nombre: string | null;
    agente_call_sid: string | null;
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
  colaId?: string | null;
  limite?: number;
  offset?: number;
}): Promise<LlamadaResumen[]> {
  const url = new URL("/api/llamadas", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  if (params.q) url.searchParams.set("q", params.q);
  if (params.estado) url.searchParams.set("estado", params.estado);
  if (params.colaId) url.searchParams.set("colaId", params.colaId);
  if (params.limite) url.searchParams.set("limite", String(params.limite));
  if (params.offset) url.searchParams.set("offset", String(params.offset));

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error listando llamadas: HTTP ${res.status}`);
  const data = await res.json();
  return data.llamadas;
}

// Usado por el panel de teléfono para saber cuándo una llamada que
// originamos pasó de "marcando" a contestada (o falló), y así arrancar/parar
// el cronómetro en vivo.
export async function buscarLlamadaPorCallSid(callSid: string): Promise<LlamadaResumen | null> {
  const url = new URL("/api/llamadas", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  url.searchParams.set("callSid", callSid);
  url.searchParams.set("limite", "1");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error consultando llamada: HTTP ${res.status}`);
  const data = await res.json();
  return data.llamadas[0] ?? null;
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

export type TipoCampoPersonalizado = "texto" | "fecha" | "dropdown";

export interface CampoPersonalizado {
  nombre: string;
  descripcion?: string;
  tipo?: TipoCampoPersonalizado; // sin valor = "texto" (compatibilidad con campos creados antes de esto)
  opciones?: string[]; // solo aplica si tipo === "dropdown"
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
  tts_provider: string | null;
  campos_personalizados: CampoPersonalizado[];
  etiquetas_disponibles: EtiquetaDisponible[];
  duracion_maxima_llamada_segundos: number;
  timeout_timbrado_segundos: number;
  tiempo_respuesta_segundos: number;
  enrutamiento_llamadas: { modo: "todos" | "round_robin" | "disponibilidad"; turno_actual?: number };
  retencion_grabaciones_dias: number;
  api_key: string | null;
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
  tts_provider: string | null;
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

export async function colgarLlamada(callSid: string): Promise<void> {
  const res = await fetch(new URL("/api/llamadas/colgar", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, callSid }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error colgando llamada: HTTP ${res.status}`);
  }
}

export async function iniciarLlamadaNormal(numero: string, colaId?: string | null): Promise<{ callSid: string }> {
  const res = await fetch(new URL("/api/llamadas/normal", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, numero, colaId: colaId || undefined }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error originando llamada: HTTP ${res.status}`);
  }
  return res.json();
}

// Token del softphone (Twilio Voice SDK): con esto el navegador del operador
// se registra para recibir las "llamadas normales" sin salir de la plataforma.
export async function obtenerTokenVoz(usuarioId?: string | null): Promise<{ token: string; identity: string }> {
  const url = new URL("/api/voice-token", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  if (usuarioId) url.searchParams.set("usuarioId", usuarioId);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error obteniendo token de voz: HTTP ${res.status}`);
  }
  return res.json();
}

export async function loginAgentePin(pin: string): Promise<{ usuarioId: string; nombre: string; rol: string }> {
  const res = await fetch(new URL("/api/agentes/login", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, pin }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error de login: HTTP ${res.status}`);
  }
  return res.json();
}

export async function marcarPresenciaAgente(usuarioId: string, disponible: boolean): Promise<void> {
  const res = await fetch(new URL("/api/agentes/presencia", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuarioId, disponible }),
  });
  if (!res.ok) throw new Error(`Error actualizando presencia: HTTP ${res.status}`);
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
  completadas_hoy: string;
  fallidas_hoy: string;
  campanas_activas: string;
  satisfaccion: {
    positivas: number;
    neutrales: number;
    negativas: number;
    total_evaluadas: number;
    porcentaje_positiva: number | null;
  };
  llamadas_por_dia: { dia: string; entrantes: string; salientes: string }[];
}

export async function obtenerResumen(colaId?: string | null): Promise<Resumen> {
  const url = new URL("/api/resumen", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  if (colaId) url.searchParams.set("colaId", colaId);
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

export async function listarContactosPorEtiqueta(etiqueta: string): Promise<ContactoResumen[]> {
  const url = new URL("/api/contactos", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  url.searchParams.set("etiqueta", etiqueta);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error listando contactos por etiqueta: HTTP ${res.status}`);
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

export async function actualizarDatosContacto(id: string, datos: Record<string, string>): Promise<void> {
  const res = await fetch(new URL(`/api/contactos/${id}/datos`, BACKEND_URL), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ datos }),
  });
  if (!res.ok) throw new Error(`Error actualizando datos: HTTP ${res.status}`);
}

export async function importarContactos(
  contactos: { numero: string; nombre?: string; apellido?: string; datos?: Record<string, string> }[]
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

// Agentes del softphone web (entran con PIN, no con contraseña todavía),
// organizados en colas, cada una con su propio modo de reparto de llamadas.
export type ModoEnrutamiento = "todos" | "round_robin" | "disponibilidad";

export interface Agente {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  pin: string;
  disponible: boolean;
  ultima_conexion: string | null;
  cola_id: string | null;
  cola_nombre: string | null;
}

export interface Cola {
  id: string;
  nombre: string;
  enrutamiento: { modo: ModoEnrutamiento; turno_actual?: number };
  agentes_asignados: number;
}

export async function listarAgentes(): Promise<Agente[]> {
  const url = new URL("/api/agentes", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error listando agentes: HTTP ${res.status}`);
  const data = await res.json();
  return data.agentes;
}

export async function crearAgente(data: {
  nombre: string;
  email: string;
  pin: string;
  colaId?: string | null;
}): Promise<void> {
  const res = await fetch(new URL("/api/agentes", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, ...data }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error creando agente: HTTP ${res.status}`);
  }
}

export async function eliminarAgente(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/agentes/${id}`, BACKEND_URL), { method: "DELETE" });
  if (!res.ok) throw new Error(`Error eliminando agente: HTTP ${res.status}`);
}

export async function loginUsuario(
  email: string,
  password: string
): Promise<{ usuarioId: string; nombre: string; rol: string; colaId: string | null }> {
  const res = await fetch(new URL("/api/auth/login", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error de login: HTTP ${res.status}`);
  }
  return res.json();
}

// Monitoreo de llamadas en vivo (solo admin): unirse a escuchar una
// "llamada normal" en curso, sin que cliente ni agente lo noten, y
// opcionalmente intervenir (hablar) desde ahí.
export async function escucharLlamada(
  llamadaId: string,
  adminUsuarioId: string
): Promise<{ conferenciaSid: string; participanteCallSid: string }> {
  const res = await fetch(new URL(`/api/llamadas/${llamadaId}/escuchar`, BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminUsuarioId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error uniéndose a la llamada: HTTP ${res.status}`);
  }
  return res.json();
}

export async function intervenirLlamada(opts: {
  conferenciaSid: string;
  participanteCallSid: string;
  activar: boolean;
}): Promise<void> {
  const res = await fetch(new URL("/api/llamadas/intervenir", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, ...opts }),
  });
  if (!res.ok) throw new Error(`Error cambiando de modo: HTTP ${res.status}`);
}

export async function dejarDeEscucharLlamada(participanteCallSid: string): Promise<void> {
  const res = await fetch(new URL("/api/llamadas/dejar-de-escuchar", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, participanteCallSid }),
  });
  if (!res.ok) throw new Error(`Error saliendo de la llamada: HTTP ${res.status}`);
}

export interface RegistroAuditoria {
  id: string;
  usuario_nombre: string;
  accion: string;
  entidad: string;
  detalle: Record<string, unknown>;
  creado_en: string;
}

export async function listarAuditoria(): Promise<RegistroAuditoria[]> {
  const url = new URL("/api/auditoria", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error listando auditoría: HTTP ${res.status}`);
  const data = await res.json();
  return data.registros;
}

// Registra en el historial de auditoría quién hizo qué. `usuarioId`/`nombre`
// vienen de la sesión del que ejecuta la acción — se llama desde el propio
// server action de Configuración justo después de guardar con éxito.
export async function registrarAuditoria(opts: {
  usuarioId: string;
  usuarioNombre: string;
  accion: string;
  entidad: string;
  detalle?: Record<string, unknown>;
}): Promise<void> {
  await fetch(new URL("/api/auditoria", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, ...opts }),
  }).catch(() => {}); // la auditoría no debe romper el flujo si falla
}

export async function actualizarEnrutamiento(modo: ModoEnrutamiento): Promise<void> {
  const res = await fetch(new URL("/api/empresa/enrutamiento", BACKEND_URL), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, modo }),
  });
  if (!res.ok) throw new Error(`Error actualizando enrutamiento: HTTP ${res.status}`);
}

export async function actualizarRetencionGrabaciones(dias: number): Promise<void> {
  const res = await fetch(new URL("/api/empresa/retencion-grabaciones", BACKEND_URL), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, dias }),
  });
  if (!res.ok) throw new Error(`Error actualizando retención de grabaciones: HTTP ${res.status}`);
}

// API key para que plataformas externas pidan llamadas vía webhook
// (POST /api/webhooks/llamadas) — Configuración → Integraciones.
export async function regenerarApiKey(): Promise<{ apiKey: string }> {
  const res = await fetch(new URL("/api/empresa/regenerar-api-key", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID }),
  });
  if (!res.ok) throw new Error(`Error generando API key: HTTP ${res.status}`);
  return res.json();
}

export async function listarColas(): Promise<Cola[]> {
  const url = new URL("/api/colas", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error listando colas: HTTP ${res.status}`);
  const data = await res.json();
  return data.colas;
}

export async function crearCola(nombre: string): Promise<void> {
  const res = await fetch(new URL("/api/colas", BACKEND_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empresaId: EMPRESA_ID, nombre }),
  });
  if (!res.ok) throw new Error(`Error creando cola: HTTP ${res.status}`);
}

export async function actualizarEnrutamientoCola(id: string, modo: ModoEnrutamiento): Promise<void> {
  const res = await fetch(new URL(`/api/colas/${id}/enrutamiento`, BACKEND_URL), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modo }),
  });
  if (!res.ok) throw new Error(`Error actualizando enrutamiento de cola: HTTP ${res.status}`);
}

export async function eliminarCola(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/colas/${id}`, BACKEND_URL), { method: "DELETE" });
  if (!res.ok) throw new Error(`Error eliminando cola: HTTP ${res.status}`);
}
