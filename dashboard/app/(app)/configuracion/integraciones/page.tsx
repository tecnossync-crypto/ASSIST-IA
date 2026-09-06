import { Plug, Webhook, Database, Sparkles, FlaskConical, Inbox } from "lucide-react";
import { obtenerEmpresa, listarWebhooksRecientes } from "@/lib/api";
import { formatFechaHora } from "@/lib/format";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { ApiKeyManager } from "@/components/ApiKeyManager";
import { ProbadorWebhooks } from "@/components/ProbadorWebhooks";

const ETIQUETAS_ENDPOINT: Record<string, string> = {
  "llamar-agente": "Llamar a un agente",
  llamadas: "Llamar con IA",
  contactos: "Actualizar contacto",
  prueba: "URL de prueba",
};

const PROXIMAMENTE = [
  { nombre: "HubSpot", descripcion: "Sincroniza contactos y dispara llamadas desde tus flujos de HubSpot." },
  { nombre: "Salesforce", descripcion: "Crea y actualiza leads automáticamente según el resultado de cada llamada." },
  { nombre: "Zapier", descripcion: "Conecta la plataforma con miles de apps sin escribir código." },
  { nombre: "Make (Integromat)", descripcion: "Automatizaciones visuales entre esta plataforma y tus otras herramientas." },
  { nombre: "Slack", descripcion: "Recibe notificaciones de llamadas transferidas o resultados importantes." },
  { nombre: "Google Sheets", descripcion: "Exporta automáticamente el resultado de cada llamada a una hoja de cálculo." },
];

export default async function IntegracionesPage() {
  const [empresa, solicitudes] = await Promise.all([
    obtenerEmpresa(),
    listarWebhooksRecientes().catch(() => []),
  ]);
  const backendPublicUrl = process.env.NEXT_PUBLIC_BACKEND_PUBLIC_URL || "https://TU-DOMINIO-BACKEND";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Plug}
        titulo="Integraciones"
        descripcion="Conecta la plataforma con tus otras herramientas."
      />

      <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <FlaskConical size={16} className="text-indigo-600" />
          URL de prueba (empieza por acá)
        </div>
        <p className="mb-4 text-xs text-muted">
          Antes de conectar tu CRM o plataforma a una de las URLs "reales" de abajo, apúntala primero a
          <strong> esta</strong>. No origina ninguna llamada ni toca ningún contacto — solo recibe lo que le
          manden y queda registrado en "Solicitudes recibidas" (más abajo en esta página), para que veas
          exactamente qué nombres de campo y qué formato manda tu plataforma. Cuando confirmes que se ve
          bien, cambia la URL en tu plataforma por la que necesites de verdad (llamar-agente, llamadas o
          contactos).
        </p>

        <div className="overflow-x-auto rounded-md bg-slate-900 p-3">
          <pre className="text-xs text-slate-100">
            <code>{`curl -X POST ${backendPublicUrl}/api/webhooks/prueba \\
  -H "content-type: application/json" \\
  -H "x-api-key: TU_API_KEY" \\
  -d '{
    "cualquier_campo": "el valor que sea",
    "numero": "+18095551234"
  }'`}</code>
          </pre>
        </div>
        <p className="mt-3 text-xs text-muted">
          Manda lo que quieras probar, con los nombres de campo que use tu plataforma — no valida nada,
          solo lo guarda para que lo revises.
        </p>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <Webhook size={16} className="text-indigo-600" />
          API para pedir llamadas por webhook
        </div>
        <p className="mb-4 text-xs text-muted">
          Cualquier plataforma tuya (un CRM, tu e-commerce, un sistema de tickets…) puede pedirle a esta
          plataforma que llame a un cliente con IA, mandando el número y — si quieres— un prompt específico
          para esa llamada puntual.
        </p>

        <ApiKeyManager apiKeyActual={empresa.api_key} />

        <div className="mt-4 overflow-x-auto rounded-md bg-slate-900 p-3">
          <pre className="text-xs text-slate-100">
            <code>{`curl -X POST ${backendPublicUrl}/api/webhooks/llamadas \\
  -H "content-type: application/json" \\
  -H "x-api-key: TU_API_KEY" \\
  -d '{
    "numero": "+18095551234",
    "prompt": "Llama para confirmar la cita de mañana a las 3pm",
    "origen": "mi-crm"
  }'`}</code>
          </pre>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          <li>
            <span className="font-mono text-ink-2">numero</span> — requerido, el teléfono a llamar (con código de país).
          </li>
          <li>
            <span className="font-mono text-ink-2">prompt</span> — opcional. Si lo mandas, reemplaza el prompt
            normal del agente solo para esta llamada; si no lo mandas, usa el guion configurado en
            Configuración → Inteligencia Artificial.
          </li>
          <li>
            <span className="font-mono text-ink-2">origen</span> — opcional, libre, solo para identificar de
            dónde vino la solicitud.
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <FlaskConical size={16} className="text-indigo-600" />
          Probar antes de conectar tu plataforma
        </div>
        <p className="mb-4 text-xs text-muted">
          Manda una solicitud real a cualquiera de los 3 webhooks de acá abajo, con tu propio API key, para
          verificar que responde bien antes de apuntar tu CRM o plataforma de verdad. Queda registrada igual
          que una solicitud real, en "Solicitudes recibidas" más abajo.
        </p>
        <ProbadorWebhooks />
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <Inbox size={16} className="text-indigo-600" />
          Solicitudes recibidas recientemente
        </div>
        <p className="mb-4 text-xs text-muted">
          Lo que de verdad llegó a estos webhooks (de tu plataforma o de la prueba de arriba) — así puedes
          verificar los parámetros exactos que manda tu integración antes de darla por buena. Recarga la
          página para actualizar.
        </p>
        {solicitudes.length === 0 ? (
          <p className="text-sm text-muted">Todavía no ha llegado ninguna solicitud.</p>
        ) : (
          <div className="flex flex-col divide-y divide-edge">
            {solicitudes.map((s) => (
              <div key={s.id} className="py-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {ETIQUETAS_ENDPOINT[s.endpoint] ?? s.endpoint}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                    }`}
                  >
                    {s.ok ? "OK" : "Error"}
                  </span>
                  {s.es_prueba && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Prueba manual</span>
                  )}
                  <span className="text-xs text-muted">{formatFechaHora(s.creado_en)}</span>
                </div>
                <pre className="overflow-x-auto rounded-md bg-surface-2 p-2 text-xs text-ink-2">
                  <code>{JSON.stringify(s.body, null, 2)}</code>
                </pre>
                {s.error && <p className="mt-1 text-xs text-red-600">{s.error}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <Webhook size={16} className="text-indigo-600" />
          API para "click to call" (conecta con un agente humano, no la IA)
        </div>
        <p className="mb-4 text-xs text-muted">
          Para cuando tu CRM u otra plataforma tenga su propio botón de "Llamar" — al presionarlo, esa
          plataforma le pega a esta URL y la llamada se conecta directo con uno de tus agentes disponibles
          (el mismo reparto configurado en Configuración → Agentes), igual que si hubieran marcado desde el
          panel de teléfono del dashboard. Aparece en vivo en el mini panel "Llamadas externas" (abajo a la
          izquierda) mientras está en curso.
        </p>

        <div className="overflow-x-auto rounded-md bg-slate-900 p-3">
          <pre className="text-xs text-slate-100">
            <code>{`curl -X POST ${backendPublicUrl}/api/webhooks/llamar-agente \\
  -H "content-type: application/json" \\
  -H "x-api-key: TU_API_KEY" \\
  -d '{
    "numero": "+18095551234",
    "colaId": "opcional, id de una cola de Configuración → Agentes",
    "origen": "mi-crm"
  }'`}</code>
          </pre>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          <li>
            <span className="font-mono text-ink-2">numero</span> — requerido, el teléfono a llamar (con código de país).
          </li>
          <li>
            <span className="font-mono text-ink-2">colaId</span> — opcional. Si no lo mandas, reparte entre
            todos los agentes según el "Reparto general".
          </li>
          <li>
            <span className="font-mono text-ink-2">origen</span> — opcional, se muestra en el mini panel para
            identificar de dónde vino la llamada (ej. "zoho", "mi-sitio").
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <Webhook size={16} className="text-indigo-600" />
          API para actualizar datos de un contacto
        </div>
        <p className="mb-4 text-xs text-muted">
          Para cuando algo cambia del lado de tu CRM (Zoho u otro) y quieres que se refleje acá — manda el número
          y los campos que cambiaron, usando el <span className="font-mono">api_name</span> de cada uno (ver
          tabla abajo), no el nombre visible.
        </p>

        <div className="overflow-x-auto rounded-md bg-slate-900 p-3">
          <pre className="text-xs text-slate-100">
            <code>{`curl -X POST ${backendPublicUrl}/api/webhooks/contactos \\
  -H "content-type: application/json" \\
  -H "x-api-key: TU_API_KEY" \\
  -d '{
    "numero": "+18095551234",
    "datos": {
${(empresa.campos_personalizados ?? []).slice(0, 2).map((c) => `      "${c.api_name ?? "campo"}": "valor"`).join(",\n") || '      "numero_de_poliza": "valor"'}
    }
  }'`}</code>
          </pre>
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <Database size={16} className="text-indigo-600" />
          Campos disponibles (api_name)
        </div>
        <p className="mb-4 text-xs text-muted">
          Estas son las claves técnicas de los campos personalizados configurados en Configuración → Contactos —
          úsalas al mapear en Zoho o cualquier otra integración.
        </p>

        {(empresa.campos_personalizados ?? []).length === 0 ? (
          <p className="text-sm text-muted">
            No hay campos personalizados configurados todavía — agrégalos en Configuración → Contactos.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-edge">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Nombre visible</th>
                  <th className="px-3 py-2 font-medium">api_name</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {(empresa.campos_personalizados ?? []).map((c) => (
                  <tr key={c.nombre}>
                    <td className="px-3 py-2 text-ink-2">{c.nombre}</td>
                    <td className="px-3 py-2 font-mono text-xs text-indigo-700">{c.api_name || "—"}</td>
                    <td className="px-3 py-2 capitalize text-muted">{c.tipo ?? "texto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-2">
          <Sparkles size={16} className="text-indigo-500" />
          Próximamente
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROXIMAMENTE.map((integracion) => (
            <div
              key={integracion.nombre}
              className="relative rounded-lg border border-dashed border-edge bg-surface-2 p-4 opacity-70"
            >
              <span className="absolute right-3 top-3 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-muted">
                Próximamente
              </span>
              <p className="text-sm font-medium text-ink-2">{integracion.nombre}</p>
              <p className="mt-1 text-xs text-muted">{integracion.descripcion}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
