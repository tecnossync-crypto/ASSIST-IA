import { NextResponse } from "next/server";
import { colgarLlamada } from "@/lib/api";

// Proxy delgado: botón "Colgar" del panel de teléfono — termina la llamada
// ya mismo en Twilio, sin depender de que el otro lado cuelgue primero.
export async function POST(req: Request) {
  const { callSid } = await req.json();

  if (!callSid || typeof callSid !== "string") {
    return NextResponse.json({ error: "callSid es requerido" }, { status: 400 });
  }

  try {
    await colgarLlamada(callSid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
