"use client";

import { createContext, useContext, useState } from "react";

/**
 * Estado del menú lateral en pantallas angostas (celular/tablet en
 * vertical): Sidebar y el botón de hamburguesa del header viven en lugares
 * distintos del árbol (ver app/(app)/layout.tsx), así que necesitan un
 * estado compartido en vez de pasarse props directamente.
 */
const MobileNavContext = createContext<{ abierto: boolean; setAbierto: (v: boolean) => void } | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return <MobileNavContext.Provider value={{ abierto, setAbierto }}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav debe usarse dentro de MobileNavProvider");
  return ctx;
}
