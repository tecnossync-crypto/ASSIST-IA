import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${BACKEND_URL}/api/agentes/${id}/2fa/iniciar`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
