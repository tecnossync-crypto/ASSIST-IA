import Link from "next/link";
import { notFound } from "next/navigation";
import { buscarLlamadaPorCallSid, obtenerLlamada, obtenerWebhookRecibido } from "@/lib/api";
import { etiquetaEstado, formatDuracion, formatFechaHora } from "@/lib/format";

const ETIQUETAS_ENDPOINT: Record<string, string> = {
  "llamar-agente": "Llamar a un agente",
  llamadas: "Llamar con IA",
  contactos: "Actualizar contacto",
  prueba: "URL de prueba",
};

export default async function ApiLogDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const solicitud = await obtenerWebhookRecibido(id).catch(() => null);
  if (!solicitud) notFound();

  const esCrudoInvalido = typeof solicitud.body?.crudo === "string";

  // La llamada real que originó esta solicitud, con su grabación y resumen (antes solo decía "búscala en Llamadas").
  const llamadaResumen = solicitud.call_sid ? await buscarLlamadaPorCallSid(solicitud.call_sid).catch(() => null) : null;
  const detalle = llamadaResumen ? await obtenerLlamada(llamadaResumen.id).catch(() => null) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/api-logs" className="text-sm text-muted hover:underline">
          ← Volver a Registros API
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {ETIQUETAS_ENDPOINT[solicitud.endpoint] ?? solicitud.endpoint} — {formatFechaHora(solicitud.creado_en)}
          </h1>
          <p className="text-sm text-muted">
            {solicitud.ok ? "Resultado: OK" : "Resultado: Error"}
            {solicitud.es_prueba ? " · Prueba manual" : ""}
            {solicitud.call_sid ? ` · CallSid: ${solicitud.call_sid}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            solicitud.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
          }`}
        >
          {solicitud.ok ? "OK" : "Error"}
        </span>
      </div>

      {solicitud.error && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-red-800">Error</h2>
          <p className="text-sm text-red-700">{solicitud.error}</p>
          {esCrudoInvalido && (
            <p className="mt-2 text-xs text-red-700">
              Revisa comillas sin escapar, comas de más, o variables sin reemplazar del lado de tu plataforma.
            </p>
          )}
        </section>
      )}

      <section className="rounded-lg border border-edge bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-2">Cuerpo de la solicitud (tal cual llegó)</h2>
        <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 text-xs text-ink-2">
          <code>
            {esCrudoInvalido
              ? (solicitud.body.crudo as string) || "(vacío)"
              : JSON.stringify(solicitud.body, null, 2)}
          </code>
        </pre>
      </section>

      {solicitud.call_sid && (
        <section className="rounded-lg border border-edge bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-2">Llamada originada</h2>
          <p className="text-sm text-ink-2">
            CallSid: <span className="font-mono">{solicitud.call_sid}</span>
          </p>

          {!detalle ? (
            <p className="mt-2 text-xs text-muted">
              Esta llamada todavía no aparece en la plataforma: se registra cuando el cliente contesta. Si nunca contestó
              (ocupado, no contestó, número inexistente), no habrá grabación.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">Estado</dt>
                  <dd className="text-ink">{etiquetaEstado(detalle.llamada.estado)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Duración</dt>
                  <dd className="text-ink">{formatDuracion(detalle.llamada.duracion_segundos)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Número</dt>
                  <dd className="font-mono text-ink">
                    {detalle.llamada.direccion === "entrante" ? detalle.llamada.numero_origen : detalle.llamada.numero_destino}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Transferida</dt>
                  <dd className="text-ink">{detalle.llamada.transferida ? "Sí" : "No"}</dd>
                </div>
              </dl>

              <div className="rounded-md border border-edge bg-surface-2/50 p-3 text-sm">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Cómo se procesó</p>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted">Regla de API aplicada</dt>
                    <dd className={detalle.origen_api?.regla_nombre ? "text-ink" : "text-amber-700 dark:text-amber-300"}>
                      {detalle.origen_api?.regla_nombre ?? "Ninguna — usó el guion general"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Departamento que mandó la API</dt>
                    <dd className="text-ink">{detalle.origen_api?.departamento_recibido ?? "No mandó"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Departamento al que quedó</dt>
                    <dd className="text-ink">{detalle.departamento_nombre ?? "Ninguno (se reparte entre todos)"}</dd>
                  </div>
                </dl>
                {detalle.origen_api?.departamento_recibido && !detalle.origen_api.departamento_asignado && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    El departamento «{detalle.origen_api.departamento_recibido}» no coincide con ninguno de Configuración →
                    Enrutamiento, así que la IA eligió sola.
                  </p>
                )}
              </div>

              {detalle.transcripcion?.resumen_motivo && (
                <p className="text-sm text-ink-2">
                  <span className="text-xs font-medium text-muted">Motivo: </span>
                  {detalle.transcripcion.resumen_motivo}
                </p>
              )}

              <div>
                <p className="mb-1 text-xs font-medium text-muted">Grabación</p>
                {detalle.grabacion?.audioUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio controls preload="none" src={detalle.grabacion.audioUrl} className="w-full max-w-md" />
                ) : (
                  <p className="text-xs text-muted">
                    {detalle.llamada.estado === "en_curso"
                      ? "La llamada sigue en curso: la grabación aparece unos segundos después de colgar."
                      : "No hay grabación de esta llamada."}
                  </p>
                )}
              </div>

              <Link href={`/llamadas/${detalle.llamada.id}`} className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                Ver la llamada completa (transcripción y datos) →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
