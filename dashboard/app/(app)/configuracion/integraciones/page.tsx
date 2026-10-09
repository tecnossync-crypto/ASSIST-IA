import Link from "next/link";
import {
  Plug,
  Webhook,
  Database,
  Sparkles,
  FlaskConical,
  Inbox,
  ListFilter,
  GitBranch,
  KeyRound,
  PhoneCall,
  Bot,
  Wrench,
  Activity,
  UserCog,
} from "lucide-react";
import { obtenerEmpresa, listarWebhooksRecientes, listarReglasApiLlamadas } from "@/lib/api";
import { formatFechaHora } from "@/lib/format";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { ApiKeyManager } from "@/components/ApiKeyManager";
import { ProbadorWebhooks } from "@/components/ProbadorWebhooks";
import { ReglasApiLlamadas } from "@/components/ReglasApiLlamadas";
import { SeccionConfig } from "@/components/SeccionConfig";
import { PestanasConfig, type PestanaConfig } from "@/components/PestanasConfig";

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

const PESTANAS: PestanaConfig[] = [
  { id: "llamadas", etiqueta: "Llamadas con IA", Icon: Bot },
  { id: "conexion", etiqueta: "Conexión y pruebas", Icon: KeyRound },
  { id: "otras", etiqueta: "Otras APIs", Icon: Wrench },
  { id: "actividad", etiqueta: "Actividad", Icon: Activity },
];

function Codigo({ children }: { children: string }) {
  return (
    <div className="overflow-x-auto rounded-md bg-slate-900 p-3">
      <pre className="text-xs text-slate-100">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default async function IntegracionesPage({
  searchParams,
}: {
  searchParams: Promise<{ seccion?: string }>;
}) {
  const { seccion } = await searchParams;
  const activa = PESTANAS.some((p) => p.id === seccion) ? (seccion as string) : "llamadas";

  const [empresa, { solicitudes }, reglas] = await Promise.all([
    obtenerEmpresa(),
    listarWebhooksRecientes({ limite: 10 }).catch(() => ({ solicitudes: [], total: 0 })),
    listarReglasApiLlamadas().catch(() => []),
  ]);
  const backendPublicUrl = process.env.NEXT_PUBLIC_BACKEND_PUBLIC_URL || "https://TU-DOMINIO-BACKEND";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Plug}
        titulo="Integraciones"
        descripcion="Conecta la plataforma con tus otras herramientas: pide llamadas por API, controla el guion y revisa lo que llega."
      />

      <PestanasConfig basePath="/configuracion/integraciones" pestanas={PESTANAS} activa={activa} />

      {activa === "llamadas" && (
        <div className="flex flex-col gap-5">
          <SeccionConfig
            Icon={Webhook}
            titulo="API para pedir llamadas por webhook"
            descripcion={
              <>
                Cualquier plataforma tuya (un CRM, tu e-commerce, un sistema de tickets…) puede pedirle a esta
                plataforma que llame a un cliente con IA, mandando el número y — si quieres — un prompt específico
                para esa llamada puntual. Tu API key está en la pestaña{" "}
                <Link href="/configuracion/integraciones?seccion=conexion" className="text-indigo-700 hover:underline">
                  Conexión y pruebas
                </Link>
                .
              </>
            }
          >
            <Codigo>{`curl -X POST ${backendPublicUrl}/api/webhooks/llamadas \\
  -H "content-type: application/json" \\
  -H "x-api-key: TU_API_KEY" \\
  -d '{
    "numero": "+18095551234",
    "prompt": "Llama para confirmar la cita de mañana a las 3pm",
    "fecha_programada": "2026-10-10T15:00:00-04:00",
    "origen": "mi-crm"
  }'`}</Codigo>
            <ul className="mt-3 space-y-1.5 text-xs text-muted">
              <li>
                <span className="font-mono text-ink-2">numero</span> — requerido, el teléfono a llamar (con código de
                país).
              </li>
              <li>
                <span className="font-mono text-ink-2">prompt</span> — opcional. Si lo mandas (y ninguna regla aplica),
                reemplaza el prompt normal del agente solo para esta llamada; si no lo mandas, usa el guion configurado
                en Configuración → Inteligencia Artificial.
              </li>
              <li>
                <span className="font-mono text-ink-2">fecha_programada</span> — opcional. Fecha y hora en que debe
                salir la llamada, en formato ISO 8601 <strong>con zona horaria</strong>, por ejemplo{" "}
                <span className="font-mono text-ink-2">2026-10-10T15:00:00-04:00</span>. Sin este campo (o con una hora
                ya pasada) la llamada sale de inmediato. Máximo 90 días.
              </li>
              <li>
                <span className="font-mono text-ink-2">retraso_minutos</span> — opcional, alternativa a la anterior:
                llamar dentro de N minutos. Si mandas los dos, manda <span className="font-mono">fecha_programada</span>.
                Con hora programada, la respuesta trae <span className="font-mono">&quot;programada&quot;: true</span> y
                el prompt que mandaste se usa cuando llegue la hora.
              </li>
              <li>
                <span className="font-mono text-ink-2">origen</span> — opcional, libre, solo para identificar de dónde
                vino la solicitud (también lo pueden usar las reglas de abajo para decidir el guion).
              </li>
            </ul>
          </SeccionConfig>

          <SeccionConfig
            Icon={GitBranch}
            titulo="Reglas del API — qué guion usar según lo que llegue"
            descripcion="Algunas plataformas (ej. Zoho SalesIQ) mandan como “prompt” una nota corta de contexto, no un guion de verdad, y esa nota terminaba reemplazando TODO el prompt del bot. Con una regla, tú controlas el guion real; el campo que llegó en el POST (ej. origen) solo decide CUÁL regla aplica. Cada regla también decide cuándo se hace la llamada. Se evalúan en orden: gana la primera que coincide, y si ninguna coincide se usa el comportamiento normal de arriba. Puedes editar el prompt de cada regla y activarla o desactivarla con su interruptor."
          >
            <ReglasApiLlamadas reglas={reglas} />
          </SeccionConfig>
        </div>
      )}

      {activa === "conexion" && (
        <div className="flex flex-col gap-5">
          <SeccionConfig
            Icon={KeyRound}
            titulo="Tu API key"
            descripcion="La clave que cada plataforma externa manda en el encabezado x-api-key para identificarse. Si la regeneras, la anterior deja de funcionar."
          >
            <ApiKeyManager apiKeyActual={empresa.api_key} />
          </SeccionConfig>

          <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/5">
            <header className="flex items-start gap-3 border-b border-indigo-200 px-5 py-4 dark:border-indigo-500/30">
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                <FlaskConical size={16} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">URL de prueba (empieza por acá)</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  Antes de conectar tu CRM o plataforma a una URL “real”, apúntala primero a <strong>esta</strong>. No
                  origina ninguna llamada ni toca ningún contacto: solo recibe lo que le manden y queda registrado en
                  la pestaña Actividad, para que veas qué nombres de campo y qué formato manda tu plataforma.
                </p>
              </div>
            </header>
            <div className="px-5 py-4">
              <Codigo>{`curl -X POST ${backendPublicUrl}/api/webhooks/prueba \\
  -H "content-type: application/json" \\
  -H "x-api-key: TU_API_KEY" \\
  -d '{
    "cualquier_campo": "el valor que sea",
    "numero": "+18095551234"
  }'`}</Codigo>
              <p className="mt-3 text-xs text-muted">
                Manda lo que quieras probar, con los nombres de campo que use tu plataforma — no valida nada, solo lo
                guarda para que lo revises.
              </p>
            </div>
          </section>

          <SeccionConfig
            Icon={FlaskConical}
            titulo="Probar antes de conectar tu plataforma"
            descripcion="Manda una solicitud real a cualquiera de los 3 webhooks, con tu propio API key, para verificar que responde bien antes de apuntar tu CRM de verdad. Queda registrada igual que una solicitud real, en la pestaña Actividad."
          >
            <ProbadorWebhooks />
          </SeccionConfig>
        </div>
      )}

      {activa === "otras" && (
        <div className="flex flex-col gap-5">
          <SeccionConfig
            Icon={PhoneCall}
            titulo="Click to call — conecta con un agente humano, no la IA"
            descripcion="Para cuando tu CRM u otra plataforma tenga su propio botón de “Llamar”: al presionarlo, esa plataforma le pega a esta URL y la llamada se conecta directo con uno de tus agentes disponibles (el mismo reparto de Configuración → Agentes), igual que si hubieran marcado desde el panel de teléfono. Aparece en vivo en el mini panel “Llamadas externas” mientras está en curso."
          >
            <Codigo>{`curl -X POST ${backendPublicUrl}/api/webhooks/llamar-agente \\
  -H "content-type: application/json" \\
  -H "x-api-key: TU_API_KEY" \\
  -d '{
    "numero": "+18095551234",
    "colaId": "opcional, id de un departamento",
    "origen": "mi-crm"
  }'`}</Codigo>
            <ul className="mt-3 space-y-1.5 text-xs text-muted">
              <li>
                <span className="font-mono text-ink-2">numero</span> — requerido, el teléfono a llamar (con código de
                país).
              </li>
              <li>
                <span className="font-mono text-ink-2">colaId</span> — opcional. Si no lo mandas, reparte entre todos
                los agentes según el “Reparto general”.
              </li>
              <li>
                <span className="font-mono text-ink-2">origen</span> — opcional, se muestra en el mini panel para
                identificar de dónde vino la llamada (ej. “zoho”, “mi-sitio”).
              </li>
            </ul>
          </SeccionConfig>

          <SeccionConfig
            Icon={UserCog}
            titulo="Actualizar datos de un contacto"
            descripcion={
              <>
                Para cuando algo cambia del lado de tu CRM (Zoho u otro) y quieres que se refleje acá: manda el número y
                los campos que cambiaron, usando el <span className="font-mono">api_name</span> de cada uno (tabla de
                abajo), no el nombre visible.
              </>
            }
          >
            <Codigo>{`curl -X POST ${backendPublicUrl}/api/webhooks/contactos \\
  -H "content-type: application/json" \\
  -H "x-api-key: TU_API_KEY" \\
  -d '{
    "numero": "+18095551234",
    "datos": {
${(empresa.campos_personalizados ?? []).slice(0, 2).map((c) => `      "${c.api_name ?? "campo"}": "valor"`).join(",\n") || '      "numero_de_poliza": "valor"'}
    }
  }'`}</Codigo>
          </SeccionConfig>

          <SeccionConfig
            Icon={Database}
            titulo="Campos disponibles (api_name)"
            descripcion="Las claves técnicas de los campos personalizados configurados en Configuración → Contactos. Úsalas al mapear en Zoho o cualquier otra integración."
          >
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
          </SeccionConfig>

          <SeccionConfig Icon={Sparkles} titulo="Próximamente" descripcion="Integraciones que estamos preparando.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PROXIMAMENTE.map((integracion) => (
                <div
                  key={integracion.nombre}
                  className="relative rounded-lg border border-dashed border-edge bg-surface-2 p-4 opacity-70"
                >
                  <span className="absolute right-3 top-3 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-muted dark:bg-slate-700">
                    Próximamente
                  </span>
                  <p className="text-sm font-medium text-ink-2">{integracion.nombre}</p>
                  <p className="mt-1 text-xs text-muted">{integracion.descripcion}</p>
                </div>
              ))}
            </div>
          </SeccionConfig>
        </div>
      )}

      {activa === "actividad" && (
        <SeccionConfig
          Icon={Inbox}
          titulo="Solicitudes recibidas recientemente"
          descripcion={
            <>
              Las últimas 10. Para ver todas con filtros, paginación y el detalle de cada una, entra a{" "}
              <Link href="/api-logs" className="inline-flex items-center gap-1 text-indigo-700 hover:underline">
                <ListFilter size={11} /> Registros API
              </Link>
              .
            </>
          }
        >
          {solicitudes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-edge py-6 text-center text-sm text-muted">
              Todavía no ha llegado ninguna solicitud.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-edge">
              {solicitudes.map((s) => (
                <div key={s.id} className="py-3 first:pt-0 last:pb-0">
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
                    <code>
                      {typeof s.body?.crudo === "string"
                        ? s.body.crudo || "(vacío)"
                        : JSON.stringify(s.body, null, 2)}
                    </code>
                  </pre>
                  {s.error && <p className="mt-1 text-xs text-red-600">{s.error}</p>}
                  {typeof s.body?.crudo === "string" && (
                    <p className="mt-1 text-xs text-amber-700">
                      Esto no llegó como JSON válido — revisa comillas sin escapar, comas de más, o variables sin
                      reemplazar del lado de tu plataforma.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SeccionConfig>
      )}
    </div>
  );
}
