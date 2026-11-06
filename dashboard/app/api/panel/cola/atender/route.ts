import { NextResponse } from "next/server";
import { atenderLlamadaCola } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { permisosDe } from "@/lib/permisos";

// Un asesor toma una llamada de la cola ("Atender" en el panel de teléfono).
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { llamadaId, usuarioId } = await req.json().catch(() => ({}));
  if (!llamadaId || typeof llamadaId !== "string") {
    return NextResponse.json({ error: "llamadaId es requerido" }, { status: 400 });
  }

  try {
    // Quien atiende es el de la sesión (no lo que mande el navegador): así nadie toma una llamada dirigida a otro.
    const quien = sesion.usuarioId ?? (typeof usuarioId === "string" && usuarioId ? usuarioId : undefined);
    await atenderLlamadaCola(llamadaId, quien, permisosDe(sesion).llamadas === "todas");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "No se pudo atender la llamada.";
    return NextResponse.json({ error: mensaje }, { status: 409 });
  }
}
