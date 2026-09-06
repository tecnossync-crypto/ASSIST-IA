export function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Versión compacta para columnas de tabla angostas (evita que se parta en
// varias líneas): "02/09/26 17:55" en vez de "2 de septiembre de 2026, 17:55".
export function formatFechaHoraCorta(iso: string): string {
  return new Date(iso).toLocaleString("es", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuracion(segundos: number | null): string {
  if (segundos == null) return "—";
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Para tramos largos (tiempo conectado en la semana/mes) — formatDuracion
// (m:ss) no sirve más allá de un rato, esto da "3h 20m" / "45m" / "0m".
export function formatDuracionLarga(segundos: number): string {
  const totalMin = Math.floor(segundos / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
  const valor = bytes / Math.pow(1024, i);
  return `${valor.toFixed(i === 0 ? 0 : 1)} ${unidades[i]}`;
}

export function etiquetaEstado(estado: string): string {
  const mapa: Record<string, string> = {
    en_curso: "En curso",
    completada: "Completada",
    fallida: "Fallida",
    transferida: "Transferida",
  };
  return mapa[estado] ?? estado;
}
