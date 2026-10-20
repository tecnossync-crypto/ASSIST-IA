import { NextResponse } from "next/server";
import { iniciarLlamadaNormal } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

// Proxy delgado: llamada "normal" (sin IA), conecta directo con un humano.
export async function POST(req: Request) {
  const { numero, colaId } = await req.json();
  // La llamada se le conecta SIEMPRE al usuario con sesión iniciada: el id sale del servidor, no de lo que mande el
  // navegador (así nadie puede pedir una llamada a nombre de otro asesor).
  const sesion = await obtenerSesion();
  const usuarioId = sesion?.usuarioId ?? null;

  if (!numero || typeof numero !== "string") {
    return NextResponse.json({ error: "numero es requerido" }, { status: 400 });
  }

  try {
    const result = await iniciarLlamadaNormal(numero, colaId ?? null, usuarioId ?? null);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
