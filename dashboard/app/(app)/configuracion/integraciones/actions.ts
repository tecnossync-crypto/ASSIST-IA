"use server";

import { revalidatePath } from "next/cache";
import {
  regenerarApiKey,
  probarWebhook,
  type EndpointWebhookPrueba,
  crearReglaApiLlamadas,
  actualizarReglaApiLlamadas,
  eliminarReglaApiLlamadas,
  probarReglasApiLlamadas,
  type ResultadoPruebaRegla,
} from "@/lib/api";
import { auditar } from "@/lib/session";

export async function regenerarApiKeyAction(): Promise<{ apiKey: string }> {
  const { apiKey } = await regenerarApiKey();
  revalidatePath("/configuracion/integraciones");
  await auditar("regenerar", "api_key", {});
  return { apiKey };
}

export async function probarWebhookAction(
  endpoint: EndpointWebhookPrueba,
  payload: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const resultado = await probarWebhook(endpoint, payload);
  revalidatePath("/configuracion/integraciones");
  return resultado;
}

export interface EstadoRegla {
  error?: string;
  ok?: boolean;
}

export async function crearReglaAction(_prevState: EstadoRegla | null, formData: FormData): Promise<EstadoRegla> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const campo = String(formData.get("campo") ?? "").trim();
  const operador = String(formData.get("operador") ?? "igual");
  const valor = String(formData.get("valor") ?? "").trim();
  const promptPersonalizado = String(formData.get("promptPersonalizado") ?? "").trim();

  if (!nombre || !campo || (operador !== "existe" && !valor) || !promptPersonalizado) {
    return { error: "Todos los campos son requeridos." };
  }

  try {
    await crearReglaApiLlamadas({ nombre, campo, operador, valor, promptPersonalizado });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la regla." };
  }

  revalidatePath("/configuracion/integraciones");
  await auditar("crear", "regla_api_llamadas", { nombre, campo, valor });
  return { ok: true };
}

export async function probarReglasAction(
  textoJson: string
): Promise<{ resultado?: ResultadoPruebaRegla; error?: string }> {
  let payload: unknown;
  try {
    payload = JSON.parse(textoJson);
  } catch {
    return { error: "Eso no es un JSON válido. Revisa las comillas y las comas." };
  }
  try {
    return { resultado: await probarReglasApiLlamadas(payload) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo probar." };
  }
}

export async function alternarReglaAction(id: string, activa: boolean) {
  await actualizarReglaApiLlamadas(id, { activa });
  revalidatePath("/configuracion/integraciones");
  await auditar("actualizar", "regla_api_llamadas", { id, activa });
}

export async function eliminarReglaAction(id: string) {
  await eliminarReglaApiLlamadas(id);
  revalidatePath("/configuracion/integraciones");
  await auditar("eliminar", "regla_api_llamadas", { id });
}
