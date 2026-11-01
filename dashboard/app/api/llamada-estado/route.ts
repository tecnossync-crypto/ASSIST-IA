import { NextResponse } from "next/server";
import { buscarLlamadaPorCallSid, buscarLlamadaPorId } from "@/lib/api";

// Proxy delgado: el panel de teléfono consulta esto mientras una llamada
// está "marcando" para saber cuándo contestan (o falla) y así mostrar el
// cronómetro en vivo.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const callSid = searchParams.get("callSid");
  const llamadaId = searchParams.get("llamadaId");

  if (!callSid && !llamadaId) {
    return NextResponse.json({ error: "callSid o llamadaId es requerido" }, { status: 400 });
  }

  try {
    const llamada = callSid ? await buscarLlamadaPorCallSid(callSid) : await buscarLlamadaPorId(llamadaId!);
    return NextResponse.json({ llamada });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
