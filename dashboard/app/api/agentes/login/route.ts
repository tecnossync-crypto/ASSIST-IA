import { NextResponse } from "next/server";
import { loginAgentePin } from "@/lib/api";

// Proxy delgado: el softphone del navegador usa esto para identificarse
// como un agente específico (PIN), sin exponer BACKEND_URL/EMPRESA_ID.
export async function POST(req: Request) {
  const { pin } = await req.json();

  if (!pin || typeof pin !== "string") {
    return NextResponse.json({ error: "pin es requerido" }, { status: 400 });
  }

  try {
    const resultado = await loginAgentePin(pin);
    return NextResponse.json(resultado);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: mensaje.includes("inválido") ? 401 : 502 });
  }
}
