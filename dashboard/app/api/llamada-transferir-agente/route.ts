import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

export async function POST(req: Request) {
  const { agenteCallSid, nuevoAgenteUsuarioId } = await req.json();
  if (!agenteCallSid || !nuevoAgenteUsuarioId) {
    return NextResponse.json({ error: "agenteCallSid y nuevoAgenteUsuarioId son requeridos" }, { status: 400 });
  }

  const res = await fetch(`${BACKEND_URL}/api/llamadas/agente/transferir`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agenteCallSid, nuevoAgenteUsuarioId }),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
