import { NextResponse } from "next/server";
import { escucharLlamada } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

// Proxy delgado: solo admin/supervisor puede escuchar una llamada en vivo.
// El usuarioId sale de la sesión del servidor, nunca del cliente — así no
// se puede falsificar desde el navegador pasando cualquier usuarioId.
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion || (sesion.rol !== "admin" && sesion.rol !== "supervisor")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { llamadaId } = await req.json();
  if (!llamadaId) {
    return NextResponse.json({ error: "llamadaId es requerido" }, { status: 400 });
  }

  try {
    const resultado = await escucharLlamada(llamadaId, sesion.usuarioId);
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
