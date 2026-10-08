"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface SesionAgenteSoftphone {
  usuarioId: string;
  nombre: string;
}

interface AgenteSoftphoneCtx {
  /** Quién es el asesor de este navegador: el usuario que inició sesión en el dashboard. */
  sesion: SesionAgenteSoftphone | null;
}

const Ctx = createContext<AgenteSoftphoneCtx | null>(null);

/**
 * Identidad del asesor para el teléfono del navegador: es SIEMPRE quien inició
 * sesión en el dashboard (email + contraseña). Antes había que "conectarse como
 * agente" con un PIN aparte; ya no — cada persona recibe llamadas con su propia
 * cuenta, y se pone Activo / En pausa / Inactivo desde el panel de teléfono.
 */
export function AgenteSoftphoneProvider({
  usuario,
  children,
}: {
  usuario: SesionAgenteSoftphone | null;
  children: ReactNode;
}) {
  const valor = useMemo(
    () => ({ sesion: usuario ? { usuarioId: usuario.usuarioId, nombre: usuario.nombre } : null }),
    [usuario?.usuarioId, usuario?.nombre] // eslint-disable-line react-hooks/exhaustive-deps
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAgenteSoftphone(): AgenteSoftphoneCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAgenteSoftphone debe usarse dentro de <AgenteSoftphoneProvider>");
  return ctx;
}
