"use server";

import { redirect } from "next/navigation";
import { loginUsuario } from "@/lib/api";
import { crearSesionCookie } from "@/lib/session";

export async function loginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) {
    return { error: "Email y contraseña son requeridos" };
  }

  try {
    const usuario = await loginUsuario(email, password);
    await crearSesionCookie(usuario);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido" };
  }

  redirect(next.startsWith("/") ? next : "/");
}
