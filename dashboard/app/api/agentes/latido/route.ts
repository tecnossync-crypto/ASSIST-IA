import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

// Latido del panel de teléfono: "este asesor sigue con el panel abierto". Si
// dejan de llegar, el backend lo pasa solo a Inactivo (ver expirarPresenciaInactiva).
export async function POST() {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    await fetch(new URL("/api/agentes/latido", BACKEND_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuarioId: sesion.usuarioId }),
    });
  } catch {
    // el próximo latido lo reintenta
  }
  return NextResponse.json({ ok: true });
}
