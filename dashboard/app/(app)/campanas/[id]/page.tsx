import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, ExternalLink, Hourglass, PhoneOff, Timer, Users } from "lucide-react";
import { obtenerCampana, obtenerReporteCampana } from "@/lib/api";
import { formatFechaHora, formatDuracion } from "@/lib/format";
import { iniciarCampanaAction, pausarCampanaAction } from "../actions";
import { BotonAccion } from "@/components/BotonAccion";
import { ProbarCampana } from "@/components/ProbarCampana";
import { Insignia, InsigniaEstadoCampana, Metrica, TarjetaTabla, TH } from "@/components/ui";

const ESTADO_CONTACTO: Record<string, { tono: "gris" | "azul" | "verde" | "rojo"; etiqueta: string; pulso?: boolean }> = {
  pendiente: { tono: "gris", etiqueta: "Pendiente" },
  llamando: { tono: "azul", etiqueta: "Llamando", pulso: true },
  completada: { tono: "verde", etiqueta: "Completada" },
  fallida: { tono: "rojo", etiqueta: "Fallida" },
};

export default async function CampanaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, reporte] = await Promise.all([
    obtenerCampana(id).catch(() => null),
    obtenerReporteCampana(id).catch(() => null),
  ]);
  if (!data) notFound();

  const { campana, contactos } = data;
  const totalReporte = Number(reporte?.total ?? 0);
  const evaluadas =
    Number(reporte?.satisfaccion_positiva ?? 0) +
    Number(reporte?.satisfaccion_neutral ?? 0) +
    Number(reporte?.satisfaccion_negativa ?? 0);
  const pct = (n: number) => (evaluadas > 0 ? (n / evaluadas) * 100 : 0);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/campanas" className="flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
        <ArrowLeft size={14} />
        Volver a campañas
      </Link>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-edge bg-surface p-5 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{campana.nombre}</h1>
            <InsigniaEstadoCampana estado={campana.estado} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <Users size={13} /> {contactos.length} contactos
            </span>
            <span className="flex items-center gap-1.5">
              <Clock3 size={13} /> hasta {campana.reintentos_max} reintentos, cada {campana.horas_entre_reintentos} h
            </span>
            <span>Creada {formatFechaHora(campana.creado_en)}</span>
          </p>
        </div>

        {campana.estado === "en_curso" ? (
          <BotonAccion
            accion={pausarCampanaAction.bind(null, campana.id)}
            mensajeExito="Campaña pausada."
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
          >
            Pausar campaña
          </BotonAccion>
        ) : campana.estado !== "completada" ? (
          <BotonAccion
            accion={iniciarCampanaAction.bind(null, campana.id)}
            mensajeExito="Campaña iniciada."
            className="ts-brand-button rounded-lg px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            {campana.estado === "borrador" ? "Iniciar campaña" : "Reanudar campaña"}
          </BotonAccion>
        ) : null}
      </section>

      <ProbarCampana campanaId={campana.id} />

      {reporte && totalReporte > 0 && (
        <section className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metrica
              Icon={CheckCircle2}
              tono="verde"
              etiqueta="Completados"
              valor={`${reporte.completados}/${reporte.total}`}
            />
            <Metrica Icon={PhoneOff} tono="rojo" etiqueta="Fallidos" valor={reporte.fallidos} />
            <Metrica
              Icon={Hourglass}
              tono="ambar"
              etiqueta="Pendientes"
              valor={Number(reporte.pendientes) + Number(reporte.llamando)}
            />
            <Metrica
              Icon={Timer}
              tono="violeta"
              etiqueta="Duración media"
              valor={formatDuracion(
                reporte.duracion_promedio_segundos ? Number(reporte.duracion_promedio_segundos) : null
              )}
            />
          </div>

          {evaluadas > 0 && (
            <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
              <p className="mb-2 text-xs font-medium text-muted">Satisfacción · {evaluadas} llamadas evaluadas</p>
              <div className="flex h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-edge">
                <div className="bg-emerald-500" style={{ width: `${pct(Number(reporte.satisfaccion_positiva))}%` }} />
                <div className="bg-slate-400" style={{ width: `${pct(Number(reporte.satisfaccion_neutral))}%` }} />
                <div className="bg-red-400" style={{ width: `${pct(Number(reporte.satisfaccion_negativa))}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <span className="text-emerald-700 dark:text-emerald-300">Positiva: {reporte.satisfaccion_positiva}</span>
                <span className="text-ink-2">Neutral: {reporte.satisfaccion_neutral}</span>
                <span className="text-red-700 dark:text-red-300">Negativa: {reporte.satisfaccion_negativa}</span>
              </div>
            </div>
          )}
        </section>
      )}

      <TarjetaTabla>
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className={TH}>Número</th>
              <th className={TH}>Nombre</th>
              <th className={TH}>Estado</th>
              <th className={TH}>Intentos</th>
              <th className={TH}>Última llamada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {contactos.map((c) => {
              const e = ESTADO_CONTACTO[c.estado] ?? { tono: "gris" as const, etiqueta: c.estado };
              return (
                <tr key={c.id} className="transition-colors hover:bg-surface-2">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-ink">{c.numero}</td>
                  <td className="px-4 py-3 text-ink-2">{c.nombre ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Insignia tono={e.tono} pulso={e.pulso}>
                      {e.etiqueta}
                    </Insignia>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-ink-2">
                    {c.intentos}/{campana.reintentos_max + 1}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {c.ultima_llamada_id ? (
                      <Link
                        href={`/llamadas/${c.ultima_llamada_id}`}
                        className="inline-flex items-center gap-1 text-indigo-700 hover:underline dark:text-indigo-300"
                      >
                        Ver llamada
                        <ExternalLink size={12} />
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TarjetaTabla>
    </div>
  );
}
