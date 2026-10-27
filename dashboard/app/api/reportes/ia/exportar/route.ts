import { NextResponse } from "next/server";
import { EMPRESA_ID } from "@/lib/api";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

// Descarga del reporte de llamadas de IA en CSV (se abre en Excel). El permiso (Resumen/Reportes) lo exige el
// middleware; el servidor solo reenvía el periodo pedido.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = new URL("/api/reportes/ia/exportar", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  for (const clave of ["desde", "hasta", "campanaId", "tipo", "tz"]) {
    const valor = searchParams.get(clave);
    if (valor) url.searchParams.set(clave, valor);
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}));
    return NextResponse.json({ error: cuerpo.error ?? "No se pudo generar el reporte" }, { status: res.status });
  }
  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": res.headers.get("content-disposition") ?? 'attachment; filename="reporte-llamadas-ia.csv"',
    },
  });
}
