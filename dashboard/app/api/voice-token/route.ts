import { NextResponse } from "next/server";
import { obtenerTokenVoz } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

// Le da al navegador el token del softphone (Twilio Voice SDK) para registrarse
// y recibir llamadas. La identidad es SIEMPRE la del usuario con sesión iniciada
// (no se acepta un usuarioId de la URL: así nadie puede pedir el token de otro
// asesor para contestar sus llamadas).
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const resultado = await obtenerTokenVoz(sesion.usuarioId);
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 });
  }
}
