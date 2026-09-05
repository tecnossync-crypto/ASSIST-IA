interface Datos {
  positivas: number;
  neutrales: number;
  negativas: number;
  total_evaluadas: number;
  porcentaje_positiva: number | null;
}

// Dona de satisfacción (positiva/neutral/negativa) en SVG puro, clasificada
// por el bot al terminar cada llamada según la transcripción — no es un
// puntaje inventado, solo se cuenta si el bot alcanzó a evaluarla.
export function DonaSatisfaccion({ datos }: { datos: Datos }) {
  const { positivas, neutrales, negativas, total_evaluadas: total, porcentaje_positiva: porcentaje } = datos;

  if (total === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-6 text-center">
        <p className="text-sm text-muted">Todavía no hay llamadas evaluadas.</p>
        <p className="mt-1 text-xs text-slate-300">Se calcula sobre los últimos 30 días.</p>
      </div>
    );
  }

  const radio = 42;
  const circunferencia = 2 * Math.PI * radio;
  const segmentos = [
    { valor: positivas, color: "stroke-emerald-500" },
    { valor: neutrales, color: "stroke-slate-300" },
    { valor: negativas, color: "stroke-red-400" },
  ];

  let acumulado = 0;
  const arcos = segmentos.map((s) => {
    const fraccion = s.valor / total;
    const largo = fraccion * circunferencia;
    const offset = -acumulado * circunferencia;
    acumulado += fraccion;
    return { ...s, largo, offset };
  });

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-28 w-28 flex-shrink-0 -rotate-90">
        <circle cx={50} cy={50} r={radio} fill="none" strokeWidth={12} className="stroke-slate-100" />
        {arcos.map(
          (a, i) =>
            a.valor > 0 && (
              <circle
                key={i}
                cx={50}
                cy={50}
                r={radio}
                fill="none"
                strokeWidth={12}
                strokeDasharray={`${a.largo} ${circunferencia - a.largo}`}
                strokeDashoffset={a.offset}
                className={a.color}
                strokeLinecap="butt"
              />
            )
        )}
      </svg>
      <div>
        <p className="text-3xl font-bold text-ink">{porcentaje ?? "—"}%</p>
        <p className="mb-2 text-xs text-muted">satisfacción positiva</p>
        <div className="flex flex-col gap-1 text-xs">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Positiva · {positivas}
          </span>
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full bg-slate-300" /> Neutral · {neutrales}
          </span>
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full bg-red-400" /> Negativa · {negativas}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-slate-300">{total} llamadas evaluadas (30 días)</p>
      </div>
    </div>
  );
}
