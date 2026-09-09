import { NextResponse } from "next/server";

// Proxy delgado: el cliente no debe conocer BACKEND_URL directamente. Para
// la imagen se reenvía el cuerpo multipart tal cual (mismo content-type con
// su boundary) en vez de reconstruirlo — más simple y no pierde nada.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contentType = req.headers.get("content-type") ?? "";
  const body = await req.arrayBuffer();

  const res = await fetch(`${BACKEND_URL}/api/agentes/${id}/avatar`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${BACKEND_URL}/api/agentes/${id}/avatar`, { cache: "no-store" });
  if (!res.ok || !res.body) {
    return new NextResponse(null, { status: res.status });
  }
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "content-type": res.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "private, max-age=300",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${BACKEND_URL}/api/agentes/${id}/avatar`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
