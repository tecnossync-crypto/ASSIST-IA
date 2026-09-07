import { NextResponse } from "next/server";
import { probarCampana } from "@/lib/api";

// Proxy delgado: el cliente no debe conocer BACKEND_URL directamente, así
// que esta ruta corre en el servidor de Next.js y reenvía al backend real.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { numero } = await req.json();

  if (!numero || typeof numero !== "string") {
    return NextResponse.json({ error: "numero es requerido" }, { status: 400 });
  }

  try {
    const result = await probarCampana(id, numero);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
