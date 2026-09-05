import { NextResponse } from "next/server";
import { marcarPresenciaAgente } from "@/lib/api";

// Proxy delgado: el softphone del navegador avisa aquí cuando un agente se
// conecta o se desconecta (incluye el sendBeacon al cerrar la pestaña).
export async function POST(req: Request) {
  const { usuarioId, disponible } = await req.json();

  if (!usuarioId || typeof disponible !== "boolean") {
    return NextResponse.json({ error: "usuarioId y disponible son requeridos" }, { status: 400 });
  }

  try {
    await marcarPresenciaAgente(usuarioId, disponible);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
