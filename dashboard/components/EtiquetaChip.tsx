const COLORES: Record<string, string> = {
  indigo: "bg-indigo-100 text-indigo-800",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  rose: "bg-rose-100 text-rose-800",
  slate: "bg-surface-2 text-ink-2",
};

export function EtiquetaChip({ nombre, color }: { nombre: string; color?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        COLORES[color ?? "indigo"] ?? COLORES.indigo
      }`}
    >
      {nombre}
    </span>
  );
}
