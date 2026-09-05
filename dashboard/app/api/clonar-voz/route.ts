import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const EMPRESA_ID = process.env.NEXT_PUBLIC_EMPRESA_ID ?? "";

// Proxy delgado: reenvía el audio subido tal cual (multipart) al backend,
// que es quien de verdad habla con ElevenLabs.
export async function POST(req: Request) {
  const entrante = await req.formData();
  const nombreVoz = entrante.get("nombreVoz");
  const audio = entrante.get("audio");

  if (!nombreVoz || !audio) {
    return NextResponse.json({ error: "nombreVoz y audio son requeridos" }, { status: 400 });
  }

  const saliente = new FormData();
  saliente.set("empresaId", EMPRESA_ID);
  saliente.set("nombreVoz", nombreVoz);
  saliente.set("audio", audio);

  try {
    const res = await fetch(new URL("/api/empresa/clonar-voz", BACKEND_URL), {
      method: "POST",
      body: saliente,
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.error ?? "Error clonando la voz" }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
