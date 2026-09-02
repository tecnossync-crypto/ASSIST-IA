import Link from "next/link";
import { Search } from "lucide-react";
import { listarContactos, obtenerEmpresa } from "@/lib/api";
import { formatFechaHora } from "@/lib/format";
import { ImportarContactos } from "@/components/ImportarContactos";
import { AgregarContactoModal } from "@/components/AgregarContactoModal";
import { EtiquetaChip } from "@/components/EtiquetaChip";

export default async function ContactosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [contactos, empresa] = await Promise.all([listarContactos(q), obtenerEmpresa()]);
  const colorPorEtiqueta = new Map(
    (empresa.etiquetas_disponibles ?? []).map((e) => [e.nombre, e.color])
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contactos</h1>
          <p className="text-sm text-slate-500">Perfil acumulado de cada cliente, a partir de lo que dice en sus llamadas.</p>
        </div>
        <span className="text-sm text-slate-500">{contactos.length} resultado(s)</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <AgregarContactoModal />
        <ImportarContactos />
      </div>

      <form className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, apellido o número…"
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          className="ts-brand-button rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
        >
          Buscar
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Número</th>
              <th className="px-4 py-2 font-medium">Etiquetas</th>
              <th className="px-4 py-2 font-medium">Otros datos</th>
              <th className="px-4 py-2 font-medium">Última actividad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contactos.map((c) => {
              const nombreCompleto = [c.nombre, c.apellido].filter(Boolean).join(" ") || "—";
              const otrosDatos = Object.entries(c.datos ?? {});
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/contactos/${c.id}`} className="font-medium text-indigo-700 hover:underline">
                      {nombreCompleto}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{c.numero}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.etiquetas ?? []).map((et) => (
                        <EtiquetaChip key={et} nombre={et} color={colorPorEtiqueta.get(et)} />
                      ))}
                    </div>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                    {otrosDatos.length > 0
                      ? otrosDatos.map(([k, v]) => `${k}: ${v}`).join(" · ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatFechaHora(c.actualizado_en)}</td>
                </tr>
              );
            })}
            {contactos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No hay contactos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
