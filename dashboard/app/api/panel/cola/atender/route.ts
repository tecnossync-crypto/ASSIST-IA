import { NextResponse } from "next/server";
import { atenderLlamadaCola } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

// Un asesor toma una llamada de la cola ("Atender" en el panel de teléfono).
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { llamadaId, usuarioId } = await req.json().catch(() => ({}));
  if (!llamadaId || typeof llamadaId !== "string") {
    return NextResponse.json({ error: "llamadaId es requerido" }, { status: 400 });
  }

  try {
    await atenderLlamadaCola(llamadaId, typeof usuarioId === "string" && usuarioId ? usuarioId : undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "No se pudo atender la llamada.";
    return NextResponse.json({ error: mensaje }, { status: 409 });
  }
}
