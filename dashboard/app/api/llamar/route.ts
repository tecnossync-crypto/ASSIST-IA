import { NextResponse } from "next/server";
import { iniciarLlamadaSaliente } from "@/lib/api";

// Proxy delgado: el cliente no debe conocer BACKEND_URL directamente, así
// que esta ruta corre en el servidor de Next.js y reenvía al backend real.
export async function POST(req: Request) {
  const { numero } = await req.json();

  if (!numero || typeof numero !== "string") {
    return NextResponse.json({ error: "numero es requerido" }, { status: 400 });
  }

  try {
    const result = await iniciarLlamadaSaliente(numero);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
