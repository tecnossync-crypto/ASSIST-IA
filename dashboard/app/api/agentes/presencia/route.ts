import { NextResponse } from "next/server";
import { marcarPresenciaAgente, type EstadoPresencia } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

// Proxy delgado: el softphone del navegador avisa aquí cuando un agente se
// conecta o se desconecta (incluye el sendBeacon al cerrar la pestaña), y el
// botón de estado del dashboard avisa aquí cuando alguien elige Disponible /
// En descanso / No disponible a mano.
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { usuarioId, disponible, estado } = await req.json();

  // Cada quien cambia SU estado; solo admin y supervisor pueden cambiar el de otro.
  if (usuarioId && usuarioId !== sesion.usuarioId && sesion.rol === "operador") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!usuarioId) {
    return NextResponse.json({ error: "usuarioId es requerido" }, { status: 400 });
  }
  if (estado === undefined && typeof disponible !== "boolean") {
    return NextResponse.json({ error: "disponible o estado son requeridos" }, { status: 400 });
  }

  try {
    await marcarPresenciaAgente(usuarioId, estado !== undefined ? { estado: estado as EstadoPresencia } : disponible);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
