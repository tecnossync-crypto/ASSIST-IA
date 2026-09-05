const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface Punto {
  dia: string;
  entrantes: string;
  salientes: string;
}

// Barras agrupadas (entrantes vs salientes) de los últimos 7 días, en SVG
// puro — sin librería de gráficos, para no sumar otra dependencia.
export function GraficoLlamadasSemana({ datos }: { datos: Punto[] }) {
  const ancho = 560;
  const alto = 180;
  const margenInferior = 24;
  const margenSuperior = 10;
  const altoDisponible = alto - margenInferior - margenSuperior;

  const maximo = Math.max(1, ...datos.map((d) => Math.max(Number(d.entrantes), Number(d.salientes))));
  const anchoGrupo = ancho / Math.max(datos.length, 1);
  const anchoBarra = Math.min(18, anchoGrupo / 3);

  return (
    <div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full" role="img" aria-label="Llamadas entrantes y salientes por día">
        {/* Líneas guía horizontales */}
        {[0, 0.5, 1].map((frac) => (
          <line
            key={frac}
            x1={0}
            x2={ancho}
            y1={margenSuperior + altoDisponible * (1 - frac)}
            y2={margenSuperior + altoDisponible * (1 - frac)}
            stroke="currentColor"
            className="text-slate-100"
            strokeWidth={1}
          />
        ))}

        {datos.map((d, i) => {
          const cx = anchoGrupo * i + anchoGrupo / 2;
          const entrantes = Number(d.entrantes);
          const salientes = Number(d.salientes);
          const hEntrantes = (entrantes / maximo) * altoDisponible;
          const hSalientes = (salientes / maximo) * altoDisponible;
          const fecha = new Date(d.dia + "T00:00:00");
          const label = DIAS_CORTOS[fecha.getDay()];

          return (
            <g key={d.dia}>
              <rect
                x={cx - anchoBarra - 2}
                y={margenSuperior + altoDisponible - hEntrantes}
                width={anchoBarra}
                height={hEntrantes}
                rx={3}
                className="fill-indigo-500"
              />
              <rect
                x={cx + 2}
                y={margenSuperior + altoDisponible - hSalientes}
                width={anchoBarra}
                height={hSalientes}
                rx={3}
                className="fill-emerald-500"
              />
              <text
                x={cx}
                y={alto - 4}
                textAnchor="middle"
                className="fill-slate-400 text-[10px]"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Entrantes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Salientes
        </span>
      </div>
    </div>
  );
}
