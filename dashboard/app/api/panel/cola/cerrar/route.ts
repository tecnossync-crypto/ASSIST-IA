import { NextResponse } from "next/server";
import { cerrarLlamadaPorId } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

// Un asesor cierra una llamada desde el panel (buzón de voz / el cliente no contesta): se cuelga al cliente.
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { llamadaId } = await req.json().catch(() => ({}));
  if (!llamadaId || typeof llamadaId !== "string") {
    return NextResponse.json({ error: "llamadaId es requerido" }, { status: 400 });
  }

  try {
    await cerrarLlamadaPorId(llamadaId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo cerrar la llamada." }, { status: 409 });
  }
}
