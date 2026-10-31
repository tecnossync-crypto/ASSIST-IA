"use client";

import { usePathname } from "next/navigation";

// Pantallas de trabajo con varios paneles lado a lado (lista + detalle) necesitan más ancho que el resto, que se
// leen mejor en una columna centrada.
const RUTAS_ANCHAS = ["/seguimiento"];

export function ContenidoPrincipal({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ancho = RUTAS_ANCHAS.some((r) => pathname.startsWith(r)) ? "max-w-[1680px]" : "max-w-5xl";
  return (
    <main className={`mx-auto w-full ${ancho} flex-1 px-3 py-5 sm:px-6 sm:py-8 print:max-w-none print:p-0`}>{children}</main>
  );
}
