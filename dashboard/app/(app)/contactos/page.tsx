import Link from "next/link";
import { Search, X, Users, Phone, UserCircle2 } from "lucide-react";
import { listarContactos, obtenerEmpresa } from "@/lib/api";
import { formatFechaHora } from "@/lib/format";
import { ImportarContactos } from "@/components/ImportarContactos";
import { AgregarContactoModal } from "@/components/AgregarContactoModal";
import { EtiquetaChip } from "@/components/EtiquetaChip";
import { BotonAccion } from "@/components/BotonAccion";
import { eliminarContactoAction } from "./[id]/actions";

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

// Colores de avatar estables por contacto (mismo contacto, mismo color) para
// distinguir filas de un vistazo sin depender de una foto.
const AVATARES = [
  "from-indigo-500 to-violet-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-sky-500 to-blue-600",
];
function colorAvatar(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARES[h % AVATARES.length];
}

export default async function ContactosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; etiqueta?: string }>;
}) {
  const { q, etiqueta } = await searchParams;
  const [todos, empresa] = await Promise.all([listarContactos(q), obtenerEmpresa()]);
  const catalogo = empresa.etiquetas_disponibles ?? [];
  const colorPorEtiqueta = new Map(catalogo.map((e) => [e.nombre, e.color]));
  // Solo se muestran los datos de campos que siguen configurados: un dato de
  // un campo que ya no existe no debe verse en la ficha.
  const camposConfigurados = new Set((empresa.campos_personalizados ?? []).map((c) => c.nombre));

  const contactos = etiqueta ? todos.filter((c) => (c.etiquetas ?? []).includes(etiqueta)) : todos;
  const hayFiltro = Boolean(q || etiqueta);

  function hrefFiltro(nuevaEtiqueta?: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nuevaEtiqueta) params.set("etiqueta", nuevaEtiqueta);
    const s = params.toString();
    return s ? `/contactos?${s}` : "/contactos";
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold">Contactos</h1>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              {contactos.length} {contactos.length === 1 ? "contacto" : "contactos"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted">Perfil acumulado de cada cliente, a partir de lo que dice en sus llamadas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AgregarContactoModal campos={empresa.campos_personalizados ?? []} />
          <ImportarContactos campos={empresa.campos_personalizados ?? []} />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-edge bg-surface p-3">
        <form className="flex gap-2">
          {etiqueta && <input type="hidden" name="etiqueta" value={etiqueta} />}
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre, apellido o número…"
              className="w-full rounded-lg border border-edge bg-surface py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button
            type="submit"
            className="ts-brand-button rounded-lg px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            Buscar
          </button>
        </form>

        {catalogo.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted">Etiqueta:</span>
            <Link
              href={hrefFiltro()}
              className={
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                (!etiqueta
                  ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                  : "border-edge text-ink-2 hover:border-indigo-300")
              }
            >
              Todas
            </Link>
            {catalogo.map((e) => (
              <Link
                key={e.nombre}
                href={hrefFiltro(e.nombre)}
                className={
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                  (etiqueta === e.nombre
                    ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : "border-edge text-ink-2 hover:border-indigo-300")
                }
              >
                {e.nombre}
              </Link>
            ))}
            {hayFiltro && (
              <Link href="/contactos" className="ml-1 flex items-center gap-1 text-xs text-muted hover:text-ink-2">
                <X size={12} /> Limpiar filtros
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-edge bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-edge bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Contacto</th>
                <th className="px-4 py-2.5 font-semibold">Propietario</th>
                <th className="px-4 py-2.5 font-semibold">Etiquetas</th>
                <th className="px-4 py-2.5 font-semibold">Datos</th>
                <th className="px-4 py-2.5 font-semibold">Última actividad</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {contactos.map((c) => {
                const nombreCompleto = [c.nombre, c.apellido].filter(Boolean).join(" ");
                const datos = Object.entries(c.datos ?? {}).filter(([k, v]) => camposConfigurados.has(k) && String(v).trim() !== "");
                return (
                  <tr key={c.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link href={`/contactos/${c.id}`} className="group flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${colorAvatar(c.id)}`}
                        >
                          {nombreCompleto ? iniciales(nombreCompleto) : <UserCircle2 size={16} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink group-hover:text-indigo-700">
                            {nombreCompleto || "Sin nombre"}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <Phone size={11} /> {c.numero}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{c.propietario_nombre ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.etiquetas ?? []).length > 0 ? (
                          (c.etiquetas ?? []).map((et) => (
                            <EtiquetaChip key={et} nombre={et} color={colorPorEtiqueta.get(et)} />
                          ))
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {datos.length > 0 ? (
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {datos.slice(0, 3).map(([k, v]) => (
                            <span
                              key={k}
                              title={`${k}: ${v}`}
                              className="max-w-[10rem] truncate rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-2"
                            >
                              <span className="text-muted">{k}:</span> {String(v)}
                            </span>
                          ))}
                          {datos.length > 3 && (
                            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">
                              +{datos.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{formatFechaHora(c.actualizado_en)}</td>
                    <td className="px-4 py-3 text-right">
                      <BotonAccion
                        accion={eliminarContactoAction.bind(null, c.id)}
                        mensajeExito="Eliminado."
                        mensajeConfirmar={`¿Eliminar el contacto "${nombreCompleto || c.numero}"? Esto no se puede deshacer.`}
                      >
                        Eliminar
                      </BotonAccion>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {contactos.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15">
              <Users size={22} />
            </span>
            <p className="text-sm font-medium text-ink">
              {hayFiltro ? "Ningún contacto coincide con tu búsqueda" : "Todavía no hay contactos"}
            </p>
            <p className="max-w-sm text-xs text-muted">
              {hayFiltro
                ? "Prueba con otro nombre o número, o quita los filtros."
                : "Agrega uno con el botón de arriba, impórtalos desde un archivo CSV, o se irán creando solos con las llamadas."}
            </p>
            {hayFiltro && (
              <Link href="/contactos" className="mt-1 text-xs font-medium text-indigo-700 hover:underline">
                Limpiar filtros
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
