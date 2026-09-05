import { NextResponse } from "next/server";
import { listarLlamadasActivas } from "@/lib/api";

// Usado por el panel de Supervisión para refrescar la lista de llamadas
// activas cada pocos segundos sin recargar la página. Gateado a admin por
// el middleware (ver dashboard/middleware.ts, prefijo /api/supervision).
export async function GET() {
  try {
    const llamadas = await listarLlamadasActivas();
    return NextResponse.json({ llamadas });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
