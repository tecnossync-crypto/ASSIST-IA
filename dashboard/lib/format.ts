export function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDuracion(segundos: number | null): string {
  if (segundos == null) return "—";
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
