"use server";

import { redirect } from "next/navigation";
import { cerrarSesionCookie } from "@/lib/session";

export async function cerrarSesionAction() {
  await cerrarSesionCookie();
  redirect("/login");
}
