"use client";

import { Menu } from "lucide-react";
import { useMobileNav } from "./MobileNavContext";

// Hamburguesa del header, solo visible en pantallas angostas (< md) — en
// desktop/tablet horizontal el Sidebar ya está siempre visible, así que este
// botón no hace falta (ver Sidebar.tsx para el panel deslizable).
export function MobileMenuButton() {
  const { setAbierto } = useMobileNav();
  return (
    <button
      type="button"
      onClick={() => setAbierto(true)}
      aria-label="Abrir menú"
      className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 md:hidden"
    >
      <Menu size={20} />
    </button>
  );
}
