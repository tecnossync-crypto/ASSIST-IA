"use server";

import { revalidatePath } from "next/cache";
import {
  regenerarApiKey,
  probarWebhook,
  type EndpointWebhookPrueba,
  crearReglaApiLlamadas,
  actualizarReglaApiLlamadas,
  eliminarReglaApiLlamadas,
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
}

export async function crearReglaAction(_prevState: EstadoRegla | null, formData: FormData): Promise<EstadoRegla> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const campo = String(formData.get("campo") ?? "").trim();
  const operador = String(formData.get("operador") ?? "igual");
  const valor = String(formData.get("valor") ?? "").trim();
  const promptPersonalizado = String(formData.get("promptPersonalizado") ?? "").trim();

  if (!nombre || !campo || !valor || !promptPersonalizado) {
    return { error: "Todos los campos son requeridos." };
  }

  try {
    await crearReglaApiLlamadas({ nombre, campo, operador, valor, promptPersonalizado });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la regla." };
  }

  revalidatePath("/configuracion/integraciones");
  await auditar("crear", "regla_api_llamadas", { nombre, campo, valor });
  return {};
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
