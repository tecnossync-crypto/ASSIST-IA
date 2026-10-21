import { NextResponse } from "next/server";
import { colgarLlamada } from "@/lib/api";

// Proxy delgado: botón "Colgar" del panel de teléfono — termina la llamada
// ya mismo en Twilio, sin depender de que el otro lado cuelgue primero.
export async function POST(req: Request) {
  const { callSid, agenteCallSid } = await req.json();

  const cliente = typeof callSid === "string" && callSid ? callSid : undefined;
  const agente = typeof agenteCallSid === "string" && agenteCallSid ? agenteCallSid : undefined;
  if (!cliente && !agente) {
    return NextResponse.json({ error: "callSid o agenteCallSid es requerido" }, { status: 400 });
  }

  try {
    await colgarLlamada(cliente, agente);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
