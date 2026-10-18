import { NextResponse } from "next/server";
import { listarContactos, listarLlamadas, listarColas, listarAgentes } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { filtroLlamadas, permisosDe } from "@/lib/permisos";

// Datos del panel de teléfono flotante (contactos, recientes, colas,
// agentes) — se piden desde el cliente en vez de bloquear el layout entero
// con esto en cada navegación (era la causa de que la pantalla de carga
// apareciera en cada cambio de sección: el layout volvía a pedir esto, sin
// caché, cada vez).
export async function GET() {
  const sesion = await obtenerSesion();
  // Cada quien ve en el panel solo lo que su rol le permite: sus contactos y sus llamadas.
  const permisos = permisosDe(sesion);
  const filtro = filtroLlamadas(sesion);

  const [contactos, recientes, colas, agentes] = await Promise.all([
    permisos.contactos === "ninguno"
      ? Promise.resolve([])
      : listarContactos(undefined, undefined, permisos.contactos === "propios" ? sesion?.usuarioId : undefined).catch(() => []),
    // "Recientes" del panel son SIEMPRE las llamadas del propio asesor (las que atendió o hizo él), sea cual sea
    // su alcance en el listado de Llamadas.
    sesion ? listarLlamadas({ limite: 15, agenteId: sesion.usuarioId }).catch(() => []) : Promise.resolve([]),
    listarColas().catch(() => []),
    listarAgentes().catch(() => []),
  ]);

  // Para el selector de "transferir a otro agente" (Softphone.tsx) — no hace
  // falta más que id/nombre, y solo agentes con acceso al softphone.
  const agentesParaTransferir = agentes
    .filter((a) => a.id !== sesion?.usuarioId)
    .map((a) => ({ id: a.id, nombre: a.nombre }));

  return NextResponse.json({ contactos, recientes, colas, agentes: agentesParaTransferir });
}
