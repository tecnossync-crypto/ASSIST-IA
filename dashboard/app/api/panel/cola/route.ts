import { NextResponse } from "next/server";
import { listarColaEspera } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { permisosDe } from "@/lib/permisos";

// Llamadas esperando en la cola (pestaña "Cola" del panel de teléfono). Un
// operador solo ve las de su departamento y las sin departamento.
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const colaId = permisosDe(sesion).llamadas === "todas" ? undefined : sesion.colaId;
  try {
    return NextResponse.json({ llamadas: await listarColaEspera(colaId ?? undefined) });
  } catch {
    return NextResponse.json({ llamadas: [] });
  }
}
