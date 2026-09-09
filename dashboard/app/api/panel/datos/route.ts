import { NextResponse } from "next/server";
import { listarContactos, listarLlamadas, listarColas, listarAgentes } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";

// Datos del panel de teléfono flotante (contactos, recientes, colas,
// agentes) — se piden desde el cliente en vez de bloquear el layout entero
// con esto en cada navegación (era la causa de que la pantalla de carga
// apareciera en cada cambio de sección: el layout volvía a pedir esto, sin
// caché, cada vez).
export async function GET() {
  const sesion = await obtenerSesion();
  const colaId = sesion?.rol === "operador" ? sesion?.colaId : undefined;

  const [contactos, recientes, colas, agentes] = await Promise.all([
    listarContactos().catch(() => []),
    listarLlamadas({ limite: 15, colaId }).catch(() => []),
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
