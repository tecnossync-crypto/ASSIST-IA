/**
 * Puente con la app de escritorio "Gestión de Llamadas" (carpeta agente-escritorio/). Dentro de la app, el
 * preload expone `window.gestionLlamadas`; en un navegador normal no existe y todo esto no hace nada.
 */
export interface PuenteEscritorio {
  esEscritorio: true;
  llamadaEntrante(numero?: string): void;
  mostrarTelefono(): void;
  ocultarTelefono(): void;
  abrirPlataforma(): void;
}

export function puenteEscritorio(): PuenteEscritorio | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { gestionLlamadas?: PuenteEscritorio }).gestionLlamadas ?? null;
}

/** Nombre del archivo del instalador que se publica en /descargas (ver agente-escritorio/README.md). */
export const INSTALADOR_ESCRITORIO = "Gestion-de-Llamadas-Setup.exe";
