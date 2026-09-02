import { NextResponse } from "next/server";
import { importarContactos } from "@/lib/api";

export async function POST(req: Request) {
  const { contactos } = await req.json();

  if (!Array.isArray(contactos) || contactos.length === 0) {
    return NextResponse.json({ error: "contactos es requerido" }, { status: 400 });
  }

  try {
    const result = await importarContactos(contactos);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
