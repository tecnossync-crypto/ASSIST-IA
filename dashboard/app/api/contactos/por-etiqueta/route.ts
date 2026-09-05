import { NextResponse } from "next/server";
import { listarContactosPorEtiqueta } from "@/lib/api";

// Proxy delgado: el formulario de campañas usa esto para autocompletar los
// números a llamar a partir de una etiqueta (ej. "interesado").
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const etiqueta = searchParams.get("etiqueta");

  if (!etiqueta) {
    return NextResponse.json({ error: "etiqueta es requerida" }, { status: 400 });
  }

  try {
    const contactos = await listarContactosPorEtiqueta(etiqueta);
    return NextResponse.json({ contactos });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
