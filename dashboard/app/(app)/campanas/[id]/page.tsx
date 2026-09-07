import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerCampana, obtenerReporteCampana } from "@/lib/api";
import { formatFechaHora, formatDuracion } from "@/lib/format";
import { iniciarCampanaAction, pausarCampanaAction } from "../actions";
import { BotonAccion } from "@/components/BotonAccion";
import { ProbarCampana } from "@/components/ProbarCampana";

const ETIQUETAS_ESTADO_CONTACTO: Record<string, string> = {
  pendiente: "Pendiente",
  llamando: "Llamando",
  completada: "Completada",
  fallida: "Fallida",
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/campanas" className="text-sm text-muted hover:underline">
          ← Volver a campañas
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{campana.nombre}</h1>
          <p className="text-sm text-muted">
            {contactos.length} contactos · reintenta hasta {campana.reintentos_max} veces, cada{" "}
            {campana.horas_entre_reintentos}h · creada {formatFechaHora(campana.creado_en)}
          </p>
        </div>

        {campana.estado === "en_curso" ? (
          <BotonAccion
            accion={pausarCampanaAction.bind(null, campana.id)}
            mensajeExito="Campaña pausada."
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Pausar campaña
          </BotonAccion>
        ) : campana.estado !== "completada" ? (
          <BotonAccion
            accion={iniciarCampanaAction.bind(null, campana.id)}
            mensajeExito="Campaña iniciada."
            className="ts-brand-button rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            {campana.estado === "borrador" ? "Iniciar campaña" : "Reanudar campaña"}
          </BotonAccion>
        ) : null}
      </div>

      <ProbarCampana campanaId={campana.id} />

      {reporte && totalReporte > 0 && (
        <div className="rounded-lg border border-edge bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">Reporte</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted">Completados</p>
              <p className="text-lg font-semibold text-ink">
                {reporte.completados}/{reporte.total}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Fallidos</p>
              <p className="text-lg font-semibold text-ink">{reporte.fallidos}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Pendientes</p>
              <p className="text-lg font-semibold text-ink">
                {Number(reporte.pendientes) + Number(reporte.llamando)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Duración promedio</p>
              <p className="text-lg font-semibold text-ink">
                {formatDuracion(
                  reporte.duracion_promedio_segundos ? Number(reporte.duracion_promedio_segundos) : null
                )}
              </p>
            </div>
          </div>
          {evaluadas > 0 && (
            <div className="mt-4 border-t border-edge pt-4">
              <p className="mb-2 text-xs text-muted">Satisfacción (de {evaluadas} llamadas evaluadas)</p>
              <div className="flex gap-4 text-sm">
                <span className="text-emerald-700">Positiva: {reporte.satisfaccion_positiva}</span>
                <span className="text-ink-2">Neutral: {reporte.satisfaccion_neutral}</span>
                <span className="text-red-700">Negativa: {reporte.satisfaccion_negativa}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-edge bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Número</th>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Intentos</th>
              <th className="px-4 py-2 font-medium">Última llamada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {contactos.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2">
                <td className="px-4 py-3">{c.numero}</td>
                <td className="px-4 py-3">{c.nombre ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (c.estado === "completada"
                        ? "bg-green-100 text-green-800"
                        : c.estado === "fallida"
                          ? "bg-red-100 text-red-800"
                          : c.estado === "llamando"
                            ? "bg-indigo-100 text-indigo-800"
                            : "bg-surface-2 text-ink-2")
                    }
                  >
                    {ETIQUETAS_ESTADO_CONTACTO[c.estado] ?? c.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {c.intentos}/{campana.reintentos_max + 1}
                </td>
                <td className="px-4 py-3">
                  {c.ultima_llamada_id ? (
                    <Link href={`/llamadas/${c.ultima_llamada_id}`} className="text-indigo-700 hover:underline">
                      Ver llamada
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
