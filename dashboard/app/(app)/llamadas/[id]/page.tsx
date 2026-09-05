import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerLlamada } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { formatFechaHora, formatDuracion, etiquetaEstado } from "@/lib/format";
import { MonitoreoLlamada } from "@/components/MonitoreoLlamada";

export default async function LlamadaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [data, sesion] = await Promise.all([obtenerLlamada(id).catch(() => null), obtenerSesion()]);
  if (!data) notFound();

  const { llamada, transcripcion, grabacion, datos } = data;

  // Un agente (rol operador) solo puede ver llamadas de su propia cola —
  // aunque adivine el id por la URL, si no es de su cola no existe para él.
  if (sesion?.rol === "operador" && llamada.cola_id !== sesion?.colaId) {
    notFound();
  }

  const puedeMonitorear =
    (sesion?.rol === "admin" || sesion?.rol === "supervisor") &&
    llamada.estado === "en_curso" &&
    llamada.agente_call_sid;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/llamadas" className="text-sm text-muted hover:underline">
          ← Volver a llamadas
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            Llamada {llamada.direccion === "entrante" ? "entrante" : "saliente"} —{" "}
            {formatFechaHora(llamada.iniciada_en)}
          </h1>
          <p className="text-sm text-muted">
            {llamada.numero_origen} → {llamada.numero_destino} · {formatDuracion(llamada.duracion_segundos)} ·{" "}
            {etiquetaEstado(llamada.estado)}
            {llamada.transferida && llamada.transferencia_destino
              ? ` · transferida a ${llamada.transferencia_destino}`
              : ""}
          </p>
        </div>
        {puedeMonitorear && <MonitoreoLlamada llamadaId={llamada.id} />}
      </div>

      <section className="rounded-lg border border-edge bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-2">Grabación</h2>
        {grabacion?.audioUrl ? (
          <audio controls src={grabacion.audioUrl} className="w-full" />
        ) : (
          <p className="text-sm text-muted">
            {grabacion ? "No se pudo generar el enlace de reproducción." : "Grabación aún no disponible."}
          </p>
        )}
        {grabacion && (
          <p className="mt-2 break-all text-xs text-muted">
            Hash de integridad: {grabacion.hash_integridad}
          </p>
        )}
      </section>

      {datos.length > 0 && (
        <section className="rounded-lg border border-edge bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-2">Datos recolectados</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {datos.map((d, i) => (
              <div key={i}>
                <dt className="text-muted">{d.campo}</dt>
                <dd className="font-medium">{d.valor}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-edge bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-2">Resumen</h2>
          {transcripcion ? (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Motivo</dt>
                <dd>{transcripcion.resumen_motivo || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Solicitud</dt>
                <dd>{transcripcion.resumen_solicitud || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Resultado</dt>
                <dd>{transcripcion.resumen_resultado || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Acción pendiente</dt>
                <dd>{transcripcion.accion_pendiente || "—"}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted">Aún no hay resumen para esta llamada.</p>
          )}
        </div>

        <div className="rounded-lg border border-edge bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-2">Transcripción</h2>
          {transcripcion && transcripcion.texto_completo?.length > 0 ? (
            <ol className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {transcripcion.texto_completo.map((turno, i) => (
                <li key={i} className={turno.hablante === "agente" ? "text-ink-2" : "text-ink"}>
                  <span className="font-medium capitalize">{turno.hablante}:</span> {turno.texto}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Sin transcripción todavía.</p>
          )}
        </div>
      </section>
    </div>
  );
}
