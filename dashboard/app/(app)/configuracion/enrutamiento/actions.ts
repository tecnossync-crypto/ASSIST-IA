"use server";

import { revalidatePath } from "next/cache";
import {
  actualizarColaEspera,
  actualizarEsperaCliente,
  type TipoEspera,
  actualizarResumenTransferencia,
  actualizarDestinoCola,
  actualizarDestinoEmpresa,
  actualizarExtensionCentral,
  crearExtensionCentral,
  eliminarExtensionCentral,
  type DestinoLlamadas,
} from "@/lib/api";
import { auditar } from "@/lib/session";

const DESTINOS: DestinoLlamadas[] = ["plataforma", "central", "ambos"];

function destinoValido(valor: FormDataEntryValue | null): DestinoLlamadas | null {
  const v = String(valor ?? "");
  return (DESTINOS as string[]).includes(v) ? (v as DestinoLlamadas) : null;
}

export interface ResultadoGuardado {
  ok?: boolean;
  error?: string;
}

// Devuelven el error en vez de tirarlo: una Server Action que lanza una
// excepción en producción solo muestra un mensaje genérico (o nada), y el
// selector parecía "deshacerse solo" sin decir por qué.
export async function guardarDestinoEmpresaAction(formData: FormData): Promise<ResultadoGuardado> {
  const destino = destinoValido(formData.get("destino"));
  if (!destino) return { error: "Destino no válido." };
  try {
    await actualizarDestinoEmpresa(destino);
    revalidatePath("/configuracion/enrutamiento");
    await auditar("actualizar", "enrutamiento_destino", { destino });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
  return { ok: true };
}

export async function guardarResumenTransferenciaAction(activo: boolean): Promise<ResultadoGuardado> {
  try {
    await actualizarResumenTransferencia(activo);
    revalidatePath("/configuracion/enrutamiento");
    await auditar("actualizar", "resumen_transferencia", { activo });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
  return { ok: true };
}

// Cola de espera (formulario con FormConFeedback): devuelve el error en vez de lanzarlo.
export async function guardarColaEsperaAction(formData: FormData): Promise<{ error?: string }> {
  const activa = formData.get("activa") === "on";
  const maxMinutos = Math.floor(Number(formData.get("maxMinutos") ?? 10));
  if (!Number.isFinite(maxMinutos) || maxMinutos < 1 || maxMinutos > 60) {
    return { error: "El tiempo máximo de espera debe ser de 1 a 60 minutos." };
  }
  try {
    await actualizarColaEspera(activa, maxMinutos);
    revalidatePath("/configuracion/enrutamiento");
    await auditar("actualizar", "cola_espera", { activa, maxMinutos });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
  return {};
}

export async function guardarEsperaClienteAction(formData: FormData): Promise<{ error?: string }> {
  const tipo = String(formData.get("tipo") ?? "musica");
  if (!["musica", "audio", "mensaje", "mensaje_musica", "silencio"].includes(tipo)) return { error: "Elige un tipo de espera válido." };
  const audioUrl = String(formData.get("audioUrl") ?? "").trim() || null;
  const mensaje = String(formData.get("mensaje") ?? "").trim() || null;
  const aviso = String(formData.get("aviso") ?? "").trim() || null;
  if (tipo === "audio" && !audioUrl) return { error: "Pega el enlace del audio." };
  if ((tipo === "mensaje" || tipo === "mensaje_musica") && !mensaje) return { error: "Escribe el mensaje que se leerá mientras el cliente espera." };
  try {
    await actualizarEsperaCliente({ tipo: tipo as TipoEspera, audioUrl, mensaje, aviso });
    revalidatePath("/configuracion/enrutamiento");
    await auditar("actualizar", "espera_cliente", { tipo });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
  return {};
}

export async function guardarDestinoColaAction(formData: FormData): Promise<ResultadoGuardado> {
  const id = String(formData.get("id"));
  // "" = usar el destino de la empresa.
  const destino = destinoValido(formData.get("destino"));
  try {
    await actualizarDestinoCola(id, destino);
    revalidatePath("/configuracion/enrutamiento");
    await auditar("actualizar", "cola_destino", { id, destino });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
  return { ok: true };
}

export interface EstadoExtension {
  error?: string;
  ok?: boolean;
}

export async function crearExtensionAction(
  _prev: EstadoExtension | null,
  formData: FormData
): Promise<EstadoExtension> {
  const numero = String(formData.get("numero") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const colaId = String(formData.get("colaId") ?? "").trim();
  if (!numero) return { error: "Escribe el número de la extensión." };

  try {
    await crearExtensionCentral({ numero, nombre: nombre || undefined, colaId: colaId || null });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la extensión." };
  }

  revalidatePath("/configuracion/enrutamiento");
  await auditar("crear", "extension_central", { numero, colaId: colaId || null });
  return { ok: true };
}

export async function cambiarColaExtensionAction(formData: FormData) {
  const id = String(formData.get("id"));
  const colaId = String(formData.get("colaId") ?? "").trim();
  await actualizarExtensionCentral(id, { colaId: colaId || null });
  revalidatePath("/configuracion/enrutamiento");
  await auditar("actualizar", "extension_central_cola", { id, colaId: colaId || null });
}

export async function cambiarActivaExtensionAction(formData: FormData) {
  const id = String(formData.get("id"));
  const activa = formData.get("activa") === "on";
  await actualizarExtensionCentral(id, { activa });
  revalidatePath("/configuracion/enrutamiento");
  await auditar("actualizar", "extension_central_activa", { id, activa });
}

export async function eliminarExtensionAction(id: string) {
  await eliminarExtensionCentral(id);
  revalidatePath("/configuracion/enrutamiento");
  await auditar("eliminar", "extension_central", { id });
}
