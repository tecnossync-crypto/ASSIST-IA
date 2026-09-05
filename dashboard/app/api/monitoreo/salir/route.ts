import { NextResponse } from "next/server";
import { dejarDeEscucharLlamada } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { participanteCallSid } = await req.json();
  if (!participanteCallSid) {
    return NextResponse.json({ error: "participanteCallSid es requerido" }, { status: 400 });
  }

  try {
    await dejarDeEscucharLlamada(participanteCallSid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
