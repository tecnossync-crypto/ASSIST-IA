"use client";

import { useEffect, useState } from "react";
import { EstadoAgenteBoton } from "@/components/EstadoAgenteBoton";
import { useAgenteSoftphone } from "@/components/AgenteSoftphoneContext";
import type { EstadoPresencia } from "@/lib/api";

// Envuelve el botón de estado de TU cuenta del dashboard (la de email +
// contraseña) para que se oculte cuando además hay una identidad de agente
// conectada por PIN — ese caso ya muestra su propio botón de estado en
// ConexionAgenteHeader, y mostrar los dos a la vez solo confundía (parecía
// que el estado "salía dos veces").
//
// El estado inicial se pide desde el cliente (no como prop desde el layout
// del servidor) para que el layout no tenga que esperar ese fetch en CADA
// navegación — era una de las causas de que la pantalla de carga completa
// apareciera en cada cambio de sección.
export function EstadoDashboardBoton({ usuarioId }: { usuarioId: string }) {
  const { sesion } = useAgenteSoftphone();
  const [estadoInicial, setEstadoInicial] = useState<EstadoPresencia | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/agentes/${usuarioId}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelado && data?.agente) setEstadoInicial(data.agente.estado_presencia);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [usuarioId]);

  if (sesion || !estadoInicial) return null;
  return <EstadoAgenteBoton usuarioId={usuarioId} estadoInicial={estadoInicial} />;
}
