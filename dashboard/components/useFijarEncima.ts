"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Fijar encima": saca el panel de teléfono a una mini-ventana que se queda SIEMPRE por encima de las demás
 * ventanas (también de otros programas) y en una esquina de la pantalla, como el widget de Zoho Assist.
 *
 * Usa la API Document Picture-in-Picture de Chrome/Edge (116+). Chrome deja la ventana abajo a la derecha y
 * recuerda dónde la dejes y de qué tamaño. Solo se puede abrir con un clic del usuario (regla del navegador),
 * por eso hay un botón y no se abre sola. La página original sigue viva (aquí vive el teléfono): el contenido
 * se dibuja dentro de la mini-ventana con un portal de React.
 */

interface DocumentPictureInPicture {
  requestWindow(opciones?: { width?: number; height?: number }): Promise<Window>;
}

function apiPiP(): DocumentPictureInPicture | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null;
}

/** Copia los estilos de la página a la mini-ventana (Tailwind, tema claro/oscuro, fuentes). */
function copiarEstilos(destino: Window) {
  const doc = destino.document;
  for (const hoja of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(hoja.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      const style = doc.createElement("style");
      style.textContent = css;
      doc.head.appendChild(style);
    } catch {
      // Hoja de otro origen (no deja leer las reglas): se enlaza tal cual.
      if (hoja.href) {
        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = hoja.href;
        doc.head.appendChild(link);
      }
    }
  }
  doc.documentElement.className = document.documentElement.className;
  for (const attr of Array.from(document.documentElement.attributes)) {
    if (attr.name.startsWith("data-")) doc.documentElement.setAttribute(attr.name, attr.value);
  }
  doc.body.className = document.body.className;
  const base = doc.createElement("style");
  base.textContent = "html,body{height:100%;margin:0;overflow:hidden}body{background:var(--surface,#fff)}";
  doc.head.appendChild(base);
}

export function useFijarEncima() {
  const [ventana, setVentana] = useState<Window | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ventanaRef = useRef<Window | null>(null);
  const soportado = typeof window !== "undefined" && apiPiP() !== null;

  const fijar = useCallback(async (ancho = 360, alto = 580) => {
    const api = apiPiP();
    if (!api) {
      setError("Este navegador no permite fijar el panel encima de otras ventanas (usa Chrome o Edge actualizado).");
      return;
    }
    setError(null);
    try {
      const pip = await api.requestWindow({ width: ancho, height: alto });
      copiarEstilos(pip);
      pip.addEventListener("pagehide", () => {
        ventanaRef.current = null;
        setVentana(null);
      });
      ventanaRef.current = pip;
      setVentana(pip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo fijar el panel.");
    }
  }, []);

  const soltar = useCallback(() => {
    ventanaRef.current?.close();
  }, []);

  // Si se cierra la ventana principal, la mini-ventana se cierra con ella.
  useEffect(() => () => ventanaRef.current?.close(), []);

  return { soportado, ventana, error, fijar, soltar };
}
