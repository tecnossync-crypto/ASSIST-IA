import { NextResponse } from "next/server";
import { intervenirLlamada } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { conferenciaSid, participanteCallSid, activar } = await req.json();
  if (!conferenciaSid || !participanteCallSid || typeof activar !== "boolean") {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  try {
    await intervenirLlamada({ conferenciaSid, participanteCallSid, activar });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
