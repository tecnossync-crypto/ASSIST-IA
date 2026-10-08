import { NextResponse } from "next/server";
import { listarTransferenciasRecientes } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

// Contexto de las llamadas que la IA acaba de transferir (pestaña "Contexto"
// del panel de teléfono). Un operador solo ve las de su departamento y las
// sin departamento; admin/supervisor ven todas.
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const colaId = sesion.rol === "operador" ? sesion.colaId : undefined;
  try {
    return NextResponse.json(await listarTransferenciasRecientes(colaId ?? undefined));
  } catch {
    return NextResponse.json({ activo: false, llamadas: [] });
  }
}
