"use client";

import { EstadoAgenteBoton } from "@/components/EstadoAgenteBoton";
import { useAgenteSoftphone } from "@/components/AgenteSoftphoneContext";
import type { EstadoPresencia } from "@/lib/api";

// Envuelve el botón de estado de TU cuenta del dashboard (la de email +
// contraseña) para que se oculte cuando además hay una identidad de agente
// conectada por PIN — ese caso ya muestra su propio botón de estado en
// ConexionAgenteHeader, y mostrar los dos a la vez solo confundía (parecía
// que el estado "salía dos veces").
export function EstadoDashboardBoton({
  usuarioId,
  estadoInicial,
}: {
  usuarioId: string;
  estadoInicial: EstadoPresencia;
}) {
  const { sesion } = useAgenteSoftphone();
  if (sesion) return null;
  return <EstadoAgenteBoton usuarioId={usuarioId} estadoInicial={estadoInicial} />;
}
