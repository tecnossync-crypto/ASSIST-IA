import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerContacto, obtenerEmpresa } from "@/lib/api";
import { formatFechaHora, formatDuracion, etiquetaEstado } from "@/lib/format";
import { EditorEtiquetasContacto } from "@/components/EditorEtiquetasContacto";
import { EditorDatosContacto } from "@/components/EditorDatosContacto";

export default async function ContactoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, empresa] = await Promise.all([obtenerContacto(id).catch(() => null), obtenerEmpresa()]);
  if (!data) notFound();

  const { contacto, llamadas } = data;
  const nombreCompleto = [contacto.nombre, contacto.apellido].filter(Boolean).join(" ") || "Sin nombre";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/contactos" className="text-sm text-slate-500 hover:underline">
          ← Volver a contactos
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">{nombreCompleto}</h1>
        <p className="text-sm text-slate-500">
          {contacto.numero} · última actividad {formatFechaHora(contacto.actualizado_en)}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Etiquetas</h2>
        <EditorEtiquetasContacto
          contactoId={contacto.id}
          catalogo={empresa.etiquetas_disponibles ?? []}
          valorInicial={contacto.etiquetas ?? []}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Datos</h2>
        <EditorDatosContacto
          contactoId={contacto.id}
          campos={empresa.campos_personalizados ?? []}
          valorInicial={contacto.datos ?? {}}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Historial de llamadas</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Dirección</th>
                <th className="px-4 py-2 font-medium">Duración</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {llamadas.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/llamadas/${l.id}`} className="text-indigo-700 hover:underline">
                      {formatFechaHora(l.iniciada_en)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize">{l.direccion}</td>
                  <td className="px-4 py-3">{formatDuracion(l.duracion_segundos)}</td>
                  <td className="px-4 py-3">{etiquetaEstado(l.estado)}</td>
                </tr>
              ))}
              {llamadas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    Sin llamadas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
