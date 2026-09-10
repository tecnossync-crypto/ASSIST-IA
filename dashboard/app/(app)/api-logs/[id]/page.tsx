import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerWebhookRecibido } from "@/lib/api";
import { formatFechaHora } from "@/lib/format";

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
          <p className="mt-1 text-xs text-muted">Búscala en Llamadas por número/fecha para ver la grabación y transcripción.</p>
        </section>
      )}
    </div>
  );
}
