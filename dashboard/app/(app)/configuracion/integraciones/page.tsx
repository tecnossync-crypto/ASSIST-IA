import { Plug, Webhook, Database, Sparkles } from "lucide-react";
import { obtenerEmpresa } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { ApiKeyManager } from "@/components/ApiKeyManager";

const PROXIMAMENTE = [
  { nombre: "HubSpot", descripcion: "Sincroniza contactos y dispara llamadas desde tus flujos de HubSpot." },
  { nombre: "Salesforce", descripcion: "Crea y actualiza leads automáticamente según el resultado de cada llamada." },
  { nombre: "Zapier", descripcion: "Conecta la plataforma con miles de apps sin escribir código." },
  { nombre: "Make (Integromat)", descripcion: "Automatizaciones visuales entre esta plataforma y tus otras herramientas." },
  { nombre: "Slack", descripcion: "Recibe notificaciones de llamadas transferidas o resultados importantes." },
  { nombre: "Google Sheets", descripcion: "Exporta automáticamente el resultado de cada llamada a una hoja de cálculo." },
];

export default async function IntegracionesPage() {
  const empresa = await obtenerEmpresa();
  const backendPublicUrl = process.env.NEXT_PUBLIC_BACKEND_PUBLIC_URL || "https://TU-DOMINIO-BACKEND";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Plug}
        titulo="Integraciones"
        descripcion="Conecta la plataforma con tus otras herramientas."
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Webhook size={16} className="text-indigo-600" />
          API para pedir llamadas por webhook
        </div>
        <p className="mb-4 text-xs text-slate-500">
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
        <ul className="mt-3 space-y-1 text-xs text-slate-500">
          <li>
            <span className="font-mono text-slate-700">numero</span> — requerido, el teléfono a llamar (con código de país).
          </li>
          <li>
            <span className="font-mono text-slate-700">prompt</span> — opcional. Si lo mandas, reemplaza el prompt
            normal del agente solo para esta llamada; si no lo mandas, usa el guion configurado en
            Configuración → Inteligencia Artificial.
          </li>
          <li>
            <span className="font-mono text-slate-700">origen</span> — opcional, libre, solo para identificar de
            dónde vino la solicitud.
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Webhook size={16} className="text-indigo-600" />
          API para actualizar datos de un contacto
        </div>
        <p className="mb-4 text-xs text-slate-500">
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

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Database size={16} className="text-indigo-600" />
          Campos disponibles (api_name)
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Estas son las claves técnicas de los campos personalizados configurados en Configuración → Contactos —
          úsalas al mapear en Zoho o cualquier otra integración.
        </p>

        {(empresa.campos_personalizados ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">
            No hay campos personalizados configurados todavía — agrégalos en Configuración → Contactos.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Nombre visible</th>
                  <th className="px-3 py-2 font-medium">api_name</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(empresa.campos_personalizados ?? []).map((c) => (
                  <tr key={c.nombre}>
                    <td className="px-3 py-2 text-slate-700">{c.nombre}</td>
                    <td className="px-3 py-2 font-mono text-xs text-indigo-700">{c.api_name || "—"}</td>
                    <td className="px-3 py-2 capitalize text-slate-500">{c.tipo ?? "texto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Sparkles size={16} className="text-indigo-500" />
          Próximamente
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROXIMAMENTE.map((integracion) => (
            <div
              key={integracion.nombre}
              className="relative rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 opacity-70"
            >
              <span className="absolute right-3 top-3 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Próximamente
              </span>
              <p className="text-sm font-medium text-slate-600">{integracion.nombre}</p>
              <p className="mt-1 text-xs text-slate-400">{integracion.descripcion}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
