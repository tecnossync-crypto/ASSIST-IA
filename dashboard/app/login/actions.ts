"use server";

import { redirect } from "next/navigation";
import { loginUsuario, verificar2FA } from "@/lib/api";
import { crearSesionCookie } from "@/lib/session";

export interface EstadoLogin {
  error?: string;
  // Cuando el usuario tiene 2FA activo, el login queda "a medias": ya se
  // validó la contraseña pero falta el código de la app autenticadora. El
  // form (LoginForm.tsx) usa esto para mostrar el segundo paso en vez de
  // crear la sesión de una vez.
  requiere2fa?: boolean;
  desafioToken?: string;
}

export async function loginAction(_prevState: EstadoLogin | undefined, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) {
    return { error: "Email y contraseña son requeridos" };
  }

  let resultado;
  try {
    resultado = await loginUsuario(email, password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido" };
  }

  if ("requiere2fa" in resultado) {
    return { requiere2fa: true, desafioToken: resultado.desafioToken };
  }

  await crearSesionCookie(resultado);
  redirect(next.startsWith("/") ? next : "/");
}

export async function verificar2FAAction(
  _prevState: EstadoLogin | undefined,
  formData: FormData
): Promise<EstadoLogin> {
  const desafioToken = String(formData.get("desafioToken") ?? "");
  const codigo = String(formData.get("codigo") ?? "").trim();
  const next = String(formData.get("next") ?? "/");

  if (!desafioToken || !codigo) {
    return { error: "Falta el código", requiere2fa: true, desafioToken };
  }

  let usuario;
  try {
    usuario = await verificar2FA(desafioToken, codigo);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error desconocido",
      requiere2fa: true,
      desafioToken,
    };
  }

  await crearSesionCookie(usuario);
  redirect(next.startsWith("/") ? next : "/");
}
