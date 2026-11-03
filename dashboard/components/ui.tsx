import type { LucideIcon } from "lucide-react";
import { PhoneIncoming, PhoneOutgoing } from "lucide-react";

/**
 * Piezas visuales compartidas por las pantallas de llamadas (Llamadas, detalle, Supervisión, Campañas): encabezado de
 * página, insignias de estado, métricas y estado vacío. Usan solo los tokens del tema, así se ven bien en claro y oscuro.
 */

/** Encabezado de página: icono, título, descripción y, a la derecha, las acciones (filtros, botones). */
export function EncabezadoPagina({
  Icon,
  titulo,
  descripcion,
  acciones,
}: {
  Icon: LucideIcon;
  titulo: string;
  descripcion?: React.ReactNode;
  acciones?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Icon size={18} />
        </span>
        <div>
          <h1 className="text-xl font-semibold leading-tight tracking-tight text-ink">{titulo}</h1>
          {descripcion && <p className="text-sm text-muted">{descripcion}</p>}
        </div>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

type Tono = "verde" | "ambar" | "rojo" | "azul" | "gris";

const TONOS: Record<Tono, { chip: string; punto: string }> = {
  verde: {
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    punto: "bg-emerald-500",
  },
  ambar: {
    chip: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    punto: "bg-amber-500",
  },
  rojo: {
    chip: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20",
    punto: "bg-red-500",
  },
  azul: {
    chip: "bg-indigo-50 text-indigo-700 ring-indigo-600/15 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
    punto: "bg-indigo-500",
  },
  gris: {
    chip: "bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10",
    punto: "bg-slate-400",
  },
};

/** Píldora de estado con punto de color (el punto late cuando `pulso` está activo, ej. "en curso"). */
export function Insignia({ tono, children, pulso }: { tono: Tono; children: React.ReactNode; pulso?: boolean }) {
  const t = TONOS[tono];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${t.chip}`}>
      <span className="relative flex h-1.5 w-1.5">
        {pulso && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${t.punto}`} />}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${t.punto}`} />
      </span>
      {children}
    </span>
  );
}

const ESTADOS_LLAMADA: Record<string, { tono: Tono; etiqueta: string; pulso?: boolean }> = {
  completada: { tono: "verde", etiqueta: "Completada" },
  transferida: { tono: "ambar", etiqueta: "Transferida" },
  fallida: { tono: "rojo", etiqueta: "Fallida" },
  en_curso: { tono: "azul", etiqueta: "En curso", pulso: true },
};

/** Estado de una llamada (completada, transferida, fallida, en curso). */
export function InsigniaEstadoLlamada({ estado }: { estado: string }) {
  const e = ESTADOS_LLAMADA[estado] ?? { tono: "gris" as Tono, etiqueta: estado };
  return (
    <Insignia tono={e.tono} pulso={e.pulso}>
      {e.etiqueta}
    </Insignia>
  );
}

const ESTADOS_CAMPANA: Record<string, { tono: Tono; etiqueta: string; pulso?: boolean }> = {
  borrador: { tono: "gris", etiqueta: "Borrador" },
  en_curso: { tono: "azul", etiqueta: "En curso", pulso: true },
  pausada: { tono: "ambar", etiqueta: "Pausada" },
  completada: { tono: "verde", etiqueta: "Completada" },
};

/** Estado de una campaña (borrador, en curso, pausada, completada). */
export function InsigniaEstadoCampana({ estado }: { estado: string }) {
  const e = ESTADOS_CAMPANA[estado] ?? { tono: "gris" as Tono, etiqueta: estado };
  return (
    <Insignia tono={e.tono} pulso={e.pulso}>
      {e.etiqueta}
    </Insignia>
  );
}

/** Icono redondo de la dirección de una llamada (entrante / saliente). */
export function IconoDireccion({ direccion, titulo }: { direccion: string; titulo?: boolean }) {
  const entrante = direccion === "entrante";
  const Icono = entrante ? PhoneIncoming : PhoneOutgoing;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={
          "flex h-7 w-7 items-center justify-center rounded-full " +
          (entrante
            ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"
            : "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300")
        }
        title={entrante ? "Entrante" : "Saliente"}
      >
        <Icono size={13} />
      </span>
      {titulo && <span className="text-sm text-ink-2">{entrante ? "Entrante" : "Saliente"}</span>}
    </span>
  );
}

/** Métrica grande con icono: para las tiras de resumen sobre las tablas. */
export function Metrica({
  Icon,
  etiqueta,
  valor,
  detalle,
  tono = "azul",
}: {
  Icon: LucideIcon;
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
  tono?: "azul" | "verde" | "ambar" | "rojo" | "violeta";
}) {
  const colores: Record<string, string> = {
    azul: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300",
    verde: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    ambar: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
    rojo: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
    violeta: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-edge bg-surface p-3.5 shadow-sm">
      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${colores[tono]}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-tight text-ink">{valor}</p>
        <p className="truncate text-xs text-muted">{etiqueta}</p>
        {detalle && <p className="truncate text-[11px] text-muted">{detalle}</p>}
      </div>
    </div>
  );
}

/** Estado vacío: cuando no hay nada que mostrar todavía. */
export function EstadoVacio({
  Icon,
  titulo,
  descripcion,
}: {
  Icon: LucideIcon;
  titulo: string;
  descripcion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted ring-1 ring-edge">
        <Icon size={20} />
      </span>
      <p className="text-sm font-medium text-ink">{titulo}</p>
      {descripcion && <p className="max-w-sm text-xs leading-relaxed text-muted">{descripcion}</p>}
    </div>
  );
}

/** Contenedor de tabla: borde, sombra suave y desplazamiento horizontal en pantallas chicas. */
export function TarjetaTabla({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface shadow-sm">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/** Clases de la cabecera y celdas de una tabla, para que todas se vean igual. */
export const TH = "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide";
