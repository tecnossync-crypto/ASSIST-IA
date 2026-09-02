"use server";

import { revalidatePath } from "next/cache";
import { actualizarEmpresa, type GuionAgente, type CampoPersonalizado } from "@/lib/api";

export async function guardarConfiguracion(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const promptPersonalizado = String(formData.get("prompt_personalizado") ?? "").trim();
  const saludo = String(formData.get("saludo") ?? "").trim();
  const queResuelve = String(formData.get("que_resuelve") ?? "").trim();
  const datosATomar = String(formData.get("datos_a_tomar") ?? "").trim();
  const cuandoTransferir = String(formData.get("cuando_transferir") ?? "").trim();
  const numeros = String(formData.get("numeros_transferencia") ?? "").trim();
  const vozAgente = String(formData.get("voz_agente") ?? "").trim();
  const camposRaw = String(formData.get("campos_personalizados") ?? "").trim();

  // Cada línea: "nombre" o "nombre: descripción".
  const campos_personalizados: CampoPersonalizado[] = camposRaw
    ? camposRaw
        .split("\n")
        .map((linea) => linea.trim())
        .filter(Boolean)
        .map((linea) => {
          const [nombre, ...resto] = linea.split(":");
          const descripcion = resto.join(":").trim();
          return { nombre: nombre.trim(), descripcion: descripcion || undefined };
        })
    : [];

  const guion_agente: GuionAgente = {
    prompt_personalizado: promptPersonalizado || undefined,
    saludo: saludo || undefined,
    que_resuelve: queResuelve || undefined,
    datos_a_tomar: datosATomar
      ? datosATomar.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
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
