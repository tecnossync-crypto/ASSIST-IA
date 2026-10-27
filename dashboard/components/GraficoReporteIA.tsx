interface PuntoDia {
  dia: string;
  total: number;
  con_conversacion: number;
  no_contestadas: number;
  transferidas: number;
}

const SERIES = [
  { clave: "con_conversacion", etiqueta: "Conversaciones", clase: "fill-indigo-500", punto: "bg-indigo-500" },
  { clave: "no_contestadas", etiqueta: "No contestadas", clase: "fill-amber-400", punto: "bg-amber-400" },
  { clave: "transferidas", etiqueta: "Transferidas a asesor", clase: "fill-emerald-500", punto: "bg-emerald-500" },
] as const;

function etiquetaDia(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}

// Barras agrupadas por día (conversaciones / no contestadas / transferidas) en SVG puro, como el gráfico del Resumen:
// sin librería de gráficos.
export function GraficoReporteIA({ datos }: { datos: PuntoDia[] }) {
  if (datos.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No hay llamadas de IA en este periodo.</p>;
  }
  const ancho = Math.max(560, datos.length * 54);
  const alto = 200;
  const margenInferior = 26;
  const margenSuperior = 12;
  const altoDisponible = alto - margenInferior - margenSuperior;
  const maximo = Math.max(1, ...datos.flatMap((d) => SERIES.map((s) => d[s.clave])));
  const anchoGrupo = ancho / datos.length;
  const anchoBarra = Math.min(14, anchoGrupo / 4.5);
  // Con muchos días solo se rotulan algunos, para que no se encimen.
  const cada = datos.length > 16 ? Math.ceil(datos.length / 12) : 1;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          style={{ minWidth: Math.min(ancho, 900) }}
          className="w-full"
          role="img"
          aria-label="Llamadas de IA por día"
        >
          {[0, 0.5, 1].map((frac) => (
            <g key={frac}>
              <line
                x1={0}
                x2={ancho}
                y1={margenSuperior + altoDisponible * (1 - frac)}
                y2={margenSuperior + altoDisponible * (1 - frac)}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-700"
                strokeWidth={1}
              />
            </g>
          ))}
          {datos.map((d, i) => {
            const cx = anchoGrupo * i + anchoGrupo / 2;
            return (
              <g key={d.dia}>
                {SERIES.map((s, j) => {
                  const valor = d[s.clave];
                  const h = (valor / maximo) * altoDisponible;
                  return (
                    <g key={s.clave}>
                      <rect
                        x={cx + (j - 1) * (anchoBarra + 2) - anchoBarra / 2}
                        y={margenSuperior + altoDisponible - h}
                        width={anchoBarra}
                        height={h}
                        rx={3}
                        className={s.clase}
                      >
                        <title>{`${etiquetaDia(d.dia)} — ${s.etiqueta}: ${valor}`}</title>
                      </rect>
                    </g>
                  );
                })}
                {i % cada === 0 && (
                  <text x={cx} y={alto - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                    {etiquetaDia(d.dia)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        {SERIES.map((s) => (
          <span key={s.clave} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${s.punto}`} />
            {s.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}
