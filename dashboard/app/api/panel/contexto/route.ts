import { NextResponse } from "next/server";
import { listarTransferenciasRecientes } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

// Contexto de las llamadas que la IA acaba de transferir (pestaña "Contexto"
// del panel de teléfono). Cada persona ve SOLO el de las llamadas que le suenan
// o atendió ella (también un administrador: para ver todo está Supervisión).
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    return NextResponse.json(await listarTransferenciasRecientes(undefined, sesion.usuarioId));
  } catch {
    return NextResponse.json({ activo: false, llamadas: [] });
  }
}
