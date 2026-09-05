import { History } from "lucide-react";
import { listarAuditoria } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { formatFechaHora } from "@/lib/format";

const ETIQUETAS_ACCION: Record<string, { label: string; color: string }> = {
  crear: { label: "Creó", color: "bg-emerald-100 text-emerald-700" },
  actualizar: { label: "Actualizó", color: "bg-indigo-100 text-indigo-700" },
  eliminar: { label: "Eliminó", color: "bg-red-100 text-red-700" },
  activar: { label: "Activó", color: "bg-emerald-100 text-emerald-700" },
  desactivar: { label: "Desactivó", color: "bg-amber-100 text-amber-700" },
};

const ETIQUETAS_ENTIDAD: Record<string, string> = {
  empresa: "Empresa",
  ia: "Inteligencia Artificial",
  agente: "Agente",
  cola: "Cola",
  enrutamiento_general: "Reparto general",
  flujo_trabajo: "Flujo de trabajo",
  contactos_config: "Configuración de contactos",
};

function resumenDetalle(entidad: string, detalle: Record<string, unknown>): string {
  const partes = Object.entries(detalle)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") || "—" : String(v)}`);
  return partes.join(" · ") || "—";
}

export default async function AuditoriaPage() {
  const registros = await listarAuditoria();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={History}
        titulo="Auditoría"
        descripcion="Quién cambió qué en Configuración, y cuándo."
      />

      <div className="overflow-hidden rounded-lg border border-edge bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Fecha</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Usuario</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Acción</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">Sección</th>
                <th className="px-4 py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {registros.map((r) => {
                const accion = ETIQUETAS_ACCION[r.accion] ?? { label: r.accion, color: "bg-surface-2 text-ink-2" };
                return (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatFechaHora(r.creado_en)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{r.usuario_nombre}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${accion.color}`}>
                        {accion.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-2">
                      {ETIQUETAS_ENTIDAD[r.entidad] ?? r.entidad}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-muted">
                      {resumenDetalle(r.entidad, r.detalle)}
                    </td>
                  </tr>
                );
              })}
              {registros.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    Todavía no hay cambios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
