"use server";

import { revalidatePath } from "next/cache";
import { regenerarApiKey, probarWebhook, type EndpointWebhookPrueba } from "@/lib/api";
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
