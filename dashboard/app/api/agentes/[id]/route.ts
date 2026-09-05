import { NextResponse } from "next/server";
import { obtenerAgentePropio } from "@/lib/api";

// Proxy delgado para que un componente cliente (el softphone flotante, que
// se identifica con un PIN de agente en vez de la cookie de sesión del
// dashboard) pueda leer el estado de presencia actual de ESE agente al
// conectarse, y así el botón de estado arranque mostrando lo correcto.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const agente = await obtenerAgentePropio(id);
    if (!agente) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
    return NextResponse.json({ agente });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
