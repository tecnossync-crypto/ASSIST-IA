import { NextResponse } from "next/server";
import { listarTransferenciasRecientes } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { permisosDe } from "@/lib/permisos";

// Contexto de las llamadas que la IA acaba de transferir (pestaña "Contexto"
// del panel de teléfono). Un operador solo ve las de su departamento y las
// sin departamento; admin/supervisor ven todas.
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const colaId = permisosDe(sesion).llamadas === "todas" ? undefined : sesion.colaId;
  try {
    return NextResponse.json(await listarTransferenciasRecientes(colaId ?? undefined));
  } catch {
    return NextResponse.json({ activo: false, llamadas: [] });
  }
}
