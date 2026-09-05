import { NextResponse } from "next/server";
import { obtenerTokenVoz } from "@/lib/api";

// Proxy delgado: le da al navegador (identidad compartida, o la de un
// agente si se pasa usuarioId) el token del softphone (Twilio Voice SDK)
// para registrarse y poder recibir "llamadas normales".
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const usuarioId = searchParams.get("usuarioId");

  try {
    const resultado = await obtenerTokenVoz(usuarioId);
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
