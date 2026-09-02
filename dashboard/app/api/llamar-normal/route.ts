import { NextResponse } from "next/server";
import { iniciarLlamadaNormal } from "@/lib/api";

// Proxy delgado: llamada "normal" (sin IA), conecta directo con un humano.
export async function POST(req: Request) {
  const { numero } = await req.json();

  if (!numero || typeof numero !== "string") {
    return NextResponse.json({ error: "numero es requerido" }, { status: 400 });
  }

  try {
    const result = await iniciarLlamadaNormal(numero);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
