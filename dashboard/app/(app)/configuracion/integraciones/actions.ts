"use server";

import { revalidatePath } from "next/cache";
import { regenerarApiKey } from "@/lib/api";
import { auditar } from "@/lib/session";

export async function regenerarApiKeyAction(): Promise<{ apiKey: string }> {
  const { apiKey } = await regenerarApiKey();
  revalidatePath("/configuracion/integraciones");
  await auditar("regenerar", "api_key", {});
  return { apiKey };
}
