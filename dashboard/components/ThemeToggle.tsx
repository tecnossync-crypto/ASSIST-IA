"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const CLAVE = "tema_voz_ia";

function temaActual(): "light" | "dark" {
  const atributo = document.documentElement.getAttribute("data-theme");
  if (atributo === "light" || atributo === "dark") return atributo;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Botón de modo claro/oscuro (arriba a la derecha, junto al estado del
// agente). El script anti-parpadeo en app/layout.tsx ya deja `data-theme`
// puesto en <html> antes de pintar la página con lo último elegido (o el
// tema del sistema si nunca se eligió nada); acá solo togglea y guarda.
export function ThemeToggle() {
  const [tema, setTema] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTema(temaActual());
  }, []);

  function alternar() {
    const siguiente = temaActual() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", siguiente);
    localStorage.setItem(CLAVE, siguiente);
    setTema(siguiente);
  }

  if (tema === null) {
    // Evita el mismatch de hidratación: no se sabe el tema hasta montar.
    return <span className="inline-block h-8 w-8" />;
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={tema === "dark" ? "Modo claro" : "Modo oscuro"}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface text-ink-2 shadow-sm transition-opacity hover:opacity-75"
    >
      {tema === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
