import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const EMPRESA_ID = process.env.NEXT_PUBLIC_EMPRESA_ID ?? "";

// Actividad de hoy del asesor (llamadas atendidas y tiempo hablado) para el
// encabezado del panel de teléfono.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const url = new URL(`/api/agentes/${encodeURIComponent(id)}/hoy`, BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  const tz = new URL(req.url).searchParams.get("tz");
  if (tz) url.searchParams.set("tz", tz);

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ llamadas: 0, segundos: 0 });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ llamadas: 0, segundos: 0 });
  }
}
