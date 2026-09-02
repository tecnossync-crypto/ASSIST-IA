"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearCampana, iniciarCampana, pausarCampana } from "@/lib/api";

export async function crearCampanaAction(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const contactosRaw = String(formData.get("contactos") ?? "").trim();
  const reintentosMax = parseInt(String(formData.get("reintentos_max") ?? "2"), 10) || 0;
  const horasEntreReintentos = parseFloat(String(formData.get("horas_entre_reintentos") ?? "4")) || 1;
  const promptOverride = String(formData.get("prompt_override") ?? "").trim();

  // Cada línea: "numero" o "numero, nombre".
  const contactos = contactosRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linea) => {
      const [numero, ...resto] = linea.split(",");
      const nombreContacto = resto.join(",").trim();
      return { numero: numero.trim(), nombre: nombreContacto || undefined };
    })
    .filter((c) => c.numero);

  if (!nombre || contactos.length === 0) return;

  const { campanaId } = await crearCampana({
    nombre,
    contactos,
    reintentosMax,
    horasEntreReintentos,
    guionOverride: promptOverride ? { prompt_personalizado: promptOverride } : null,
  });

  revalidatePath("/campanas");
  redirect(`/campanas/${campanaId}`);
}

export async function iniciarCampanaAction(formData: FormData) {
  const id = String(formData.get("id"));
  await iniciarCampana(id);
  revalidatePath("/campanas");
  revalidatePath(`/campanas/${id}`);
}

export async function pausarCampanaAction(formData: FormData) {
  const id = String(formData.get("id"));
  await pausarCampana(id);
  revalidatePath("/campanas");
  revalidatePath(`/campanas/${id}`);
}
