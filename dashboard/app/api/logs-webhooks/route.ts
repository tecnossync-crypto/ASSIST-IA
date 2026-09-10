import { NextResponse } from "next/server";
import { listarWebhooksRecientes } from "@/lib/api";

// Proxy para el panel de logs (client component, necesita re-pedir cada vez
// que cambia la página o el filtro) — la página de Integraciones en sí pide
// esto server-side directo, sin pasar por acá.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limite = url.searchParams.get("limite");
  const offset = url.searchParams.get("offset");
  const endpoint = url.searchParams.get("endpoint");
  const ok = url.searchParams.get("ok");

  try {
    const data = await listarWebhooksRecientes({
      limite: limite ? Number(limite) : undefined,
      offset: offset ? Number(offset) : undefined,
      endpoint: endpoint || undefined,
      ok: ok === "true" ? true : ok === "false" ? false : undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
