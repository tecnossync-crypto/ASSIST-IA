import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerCampana } from "@/lib/api";
import { formatFechaHora } from "@/lib/format";
import { iniciarCampanaAction, pausarCampanaAction } from "../actions";
import { BotonAccion } from "@/components/BotonAccion";

const ETIQUETAS_ESTADO_CONTACTO: Record<string, string> = {
  pendiente: "Pendiente",
  llamando: "Llamando",
  completada: "Completada",
  fallida: "Fallida",
};

export default async function CampanaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await obtenerCampana(id).catch(() => null);
  if (!data) notFound();

  const { campana, contactos } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/campanas" className="text-sm text-slate-500 hover:underline">
          ← Volver a campañas
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{campana.nombre}</h1>
          <p className="text-sm text-slate-500">
            {contactos.length} contactos · reintenta hasta {campana.reintentos_max} veces, cada{" "}
            {campana.horas_entre_reintentos}h · creada {formatFechaHora(campana.creado_en)}
          </p>
        </div>

        {campana.estado === "en_curso" ? (
          <BotonAccion
            accion={pausarCampanaAction.bind(null, campana.id)}
            mensajeExito="Campaña pausada."
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Pausar campaña
          </BotonAccion>
        ) : campana.estado !== "completada" ? (
          <BotonAccion
            accion={iniciarCampanaAction.bind(null, campana.id)}
            mensajeExito="Campaña iniciada."
            className="ts-brand-button rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            {campana.estado === "borrador" ? "Iniciar campaña" : "Reanudar campaña"}
          </BotonAccion>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Número</th>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Intentos</th>
              <th className="px-4 py-2 font-medium">Última llamada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contactos.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">{c.numero}</td>
                <td className="px-4 py-3">{c.nombre ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (c.estado === "completada"
                        ? "bg-green-100 text-green-800"
                        : c.estado === "fallida"
                          ? "bg-red-100 text-red-800"
                          : c.estado === "llamando"
                            ? "bg-indigo-100 text-indigo-800"
                            : "bg-slate-100 text-slate-700")
                    }
                  >
                    {ETIQUETAS_ESTADO_CONTACTO[c.estado] ?? c.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {c.intentos}/{campana.reintentos_max + 1}
                </td>
                <td className="px-4 py-3">
                  {c.ultima_llamada_id ? (
                    <Link href={`/llamadas/${c.ultima_llamada_id}`} className="text-indigo-700 hover:underline">
                      Ver llamada
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
