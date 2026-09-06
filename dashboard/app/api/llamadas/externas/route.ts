import { NextResponse } from "next/server";
import { listarLlamadasExternas } from "@/lib/api";

// Usado por el widget de "llamadas externas" para refrescarse cada pocos
// segundos sin recargar la página.
export async function GET() {
  try {
    const llamadas = await listarLlamadasExternas();
    return NextResponse.json({ llamadas });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
