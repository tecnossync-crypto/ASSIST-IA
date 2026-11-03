import Link from "next/link";
import { Phone, PhoneCall, CheckCircle2, Forward, PhoneOff, Timer, ChevronRight } from "lucide-react";
import { listarLlamadas } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { formatDuracion } from "@/lib/format";
import { BuscadorLlamadas } from "@/components/BuscadorLlamadas";
import {
  EncabezadoPagina,
  EstadoVacio,
  IconoDireccion,
  InsigniaEstadoLlamada,
  Metrica,
  TarjetaTabla,
  TH,
} from "@/components/ui";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

export default async function LlamadasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const { q, estado } = await searchParams;
  const sesion = await obtenerSesion();
  // Un agente (rol operador) solo ve las llamadas de su propia cola. Si no
  // tiene cola asignada, no ve ninguna (en vez de, por accidente, todas).
  const esOperadorSinCola = sesion?.rol === "operador" && !sesion?.colaId;
  const colaId = sesion?.rol === "operador" ? sesion?.colaId : undefined;
  const llamadas = esOperadorSinCola ? [] : await listarLlamadas({ q, estado, colaId });

  const completadas = llamadas.filter((l) => l.estado === "completada").length;
  const transferidas = llamadas.filter((l) => l.estado === "transferida").length;
  const fallidas = llamadas.filter((l) => l.estado === "fallida").length;
  const conDuracion = llamadas.filter((l) => l.duracion_segundos != null && l.duracion_segundos > 0);
  const promedio = conDuracion.length
    ? Math.round(conDuracion.reduce((s, l) => s + (l.duracion_segundos ?? 0), 0) / conDuracion.length)
    : null;
  const pct = (n: number) => (llamadas.length ? `${Math.round((n / llamadas.length) * 100)}%` : undefined);
  const filtrando = Boolean(q || estado);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        Icon={Phone}
        titulo="Llamadas"
        descripcion="Historial de llamadas con su estado, motivo, resumen de la IA y grabación."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metrica Icon={PhoneCall} etiqueta={filtrando ? "Resultados" : "Llamadas"} valor={llamadas.length} />
        <Metrica Icon={CheckCircle2} tono="verde" etiqueta="Completadas" valor={completadas} detalle={pct(completadas)} />
        <Metrica Icon={Forward} tono="ambar" etiqueta="Transferidas" valor={transferidas} detalle={pct(transferidas)} />
        <Metrica Icon={PhoneOff} tono="rojo" etiqueta="Fallidas" valor={fallidas} detalle={pct(fallidas)} />
        <Metrica Icon={Timer} tono="violeta" etiqueta="Duración media" valor={promedio != null ? formatDuracion(promedio) : "—"} />
      </div>

      <BuscadorLlamadas />

      <TarjetaTabla>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className={TH}>Fecha</th>
              <th className={TH}>Dirección</th>
              <th className={TH}>Número</th>
              <th className={TH}>Duración</th>
              <th className={TH}>Estado</th>
              <th className={`${TH} w-full`}>Motivo</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {llamadas.map((l) => (
              <tr key={l.id} className="group transition-colors hover:bg-surface-2">
                <td className="whitespace-nowrap px-4 py-3">
                  <Link href={`/llamadas/${l.id}`} className="block leading-tight">
                    <span className="block font-medium text-ink">{fecha(l.iniciada_en)}</span>
                    <span className="text-xs text-muted">{hora(l.iniciada_en)}</span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <IconoDireccion direccion={l.direccion} titulo />
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-ink">
                  {l.direccion === "entrante" ? l.numero_origen : l.numero_destino}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-ink-2">{formatDuracion(l.duracion_segundos)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <InsigniaEstadoLlamada estado={l.estado} />
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-ink-2">{l.resumen_motivo ?? <span className="text-muted">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Link
                    href={`/llamadas/${l.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-edge bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors group-hover:border-indigo-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300"
                  >
                    Ver detalle
                    <ChevronRight size={13} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {llamadas.length === 0 && (
          <EstadoVacio
            Icon={Phone}
            titulo={filtrando ? "Ninguna llamada coincide con la búsqueda" : "Todavía no hay llamadas"}
            descripcion={
              esOperadorSinCola
                ? "No perteneces a ninguna cola todavía — pídele a un admin que te asigne una en Configuración → Agentes."
                : filtrando
                  ? "Prueba con otro número, otro motivo o quita el filtro de estado."
                  : "Cuando entren o salgan llamadas, aparecerán aquí con su resumen y grabación."
            }
          />
        )}
      </TarjetaTabla>
    </div>
  );
}
