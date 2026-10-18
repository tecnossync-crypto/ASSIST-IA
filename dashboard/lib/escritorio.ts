/**
 * Puente con la app de escritorio "Gestión de Llamadas" (carpeta agente-escritorio/). Dentro de la app, el
 * preload expone `window.gestionLlamadas`; en un navegador normal no existe y todo esto no hace nada.
 */
export interface PuenteEscritorio {
  esEscritorio: true;
  /** true solo en la ventana del teléfono flotante (la que se contrae a burbuja). */
  esTelefono: boolean;
  llamadaEntrante(numero?: string): void;
  mostrarTelefono(): void;
  ocultarTelefono(): void;
  abrirPlataforma(): void;
  /** Contrae el teléfono a burbuja (false) o abre el panel (true); la ventana se mantiene pegada al borde. */
  fijarExpandido(expandido: boolean): void;
  /** El usuario pulsó el atajo o el icono de la bandeja: abrir/contraer. Devuelve cómo dejar de escuchar. */
  alAlternarExpandido(callback: () => void): () => void;
  arrastreInicio(): void;
  arrastreMover(dx: number, dy: number): void;
  arrastreFin(): void;
}

export function puenteEscritorio(): PuenteEscritorio | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { gestionLlamadas?: PuenteEscritorio }).gestionLlamadas ?? null;
}

/** Nombre del archivo del instalador que se publica en /descargas (ver agente-escritorio/README.md). */
export const INSTALADOR_ESCRITORIO = "Gestion-de-Llamadas-Setup.exe";
