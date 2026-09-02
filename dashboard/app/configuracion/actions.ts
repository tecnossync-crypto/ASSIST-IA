"use server";

import { revalidatePath } from "next/cache";
import { actualizarEmpresa, type GuionAgente, type CampoPersonalizado } from "@/lib/api";

export async function guardarConfiguracion(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const promptPersonalizado = String(formData.get("prompt_personalizado") ?? "").trim();
  const saludo = String(formData.get("saludo") ?? "").trim();
  const queResuelve = String(formData.get("que_resuelve") ?? "").trim();
  const cuandoTransferir = String(formData.get("cuando_transferir") ?? "").trim();
  const numeros = String(formData.get("numeros_transferencia") ?? "").trim();
  const vozAgente = String(formData.get("voz_agente") ?? "").trim();
  const camposJson = String(formData.get("campos_personalizados_json") ?? "[]");

  let campos_personalizados: CampoPersonalizado[] = [];
  try {
    campos_personalizados = (JSON.parse(camposJson) as CampoPersonalizado[]).filter((c) => c.nombre?.trim());
  } catch {
    campos_personalizados = [];
  }

  const guion_agente: GuionAgente = {
    prompt_personalizado: promptPersonalizado || undefined,
    saludo: saludo || undefined,
    que_resuelve: queResuelve || undefined,
    // Estos tres siempre se piden, además de lo que la empresa agregue en campos_personalizados.
    datos_a_tomar: ["nombre", "apellido", "telefono"],
    cuando_transferir: cuandoTransferir || undefined,
  };

  const numeros_transferencia = numeros
    ? numeros.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  await actualizarEmpresa({
    nombre,
    guion_agente,
    numeros_transferencia,
    voz_agente: vozAgente || null,
    campos_personalizados,
  });
  revalidatePath("/configuracion");
}
