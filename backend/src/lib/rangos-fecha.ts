/**
 * Intervalos de fecha para los filtros del dashboard (Resumen, tiempo
 * conectado). Whitelist fija de expresiones SQL — nunca se interpola el
 * query param directo, solo se usa para elegir una de estas entradas.
 */
export type RangoFecha = "hoy" | "ayer" | "semana" | "semana_pasada" | "mes";

export const RANGOS_FECHA: Record<RangoFecha, { desdeSQL: string; hastaSQL: string }> = {
  hoy: { desdeSQL: "date_trunc('day', now())", hastaSQL: "now()" },
  ayer: {
    desdeSQL: "date_trunc('day', now()) - interval '1 day'",
    hastaSQL: "date_trunc('day', now())",
  },
  semana: { desdeSQL: "date_trunc('week', now())", hastaSQL: "now()" },
  semana_pasada: {
    desdeSQL: "date_trunc('week', now()) - interval '7 days'",
    hastaSQL: "date_trunc('week', now())",
  },
  mes: { desdeSQL: "date_trunc('month', now())", hastaSQL: "now()" },
};

export function rangoFechaValido(valor: string | undefined): RangoFecha {
  return valor && valor in RANGOS_FECHA ? (valor as RangoFecha) : "hoy";
}
