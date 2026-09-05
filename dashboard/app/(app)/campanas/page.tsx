import Link from "next/link";
import { Megaphone } from "lucide-react";
import { listarCampanas, obtenerEmpresa } from "@/lib/api";
import { formatFechaHora } from "@/lib/format";
import { crearCampanaAction, iniciarCampanaAction, pausarCampanaAction } from "./actions";
import { CampanaContactosInput } from "@/components/CampanaContactosInput";
import { BotonAccion } from "@/components/BotonAccion";

const ETIQUETAS_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  en_curso: "En curso",
  pausada: "Pausada",
  completada: "Completada",
};

export default async function CampanasPage() {
  const [campanas, empresa] = await Promise.all([listarCampanas(), obtenerEmpresa()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Campañas</h1>
        <p className="text-sm text-slate-500">
          Llamadas salientes masivas con reintentos automáticos si no contestan.
        </p>
      </div>

      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-5 py-3 text-sm font-medium text-slate-700">
          <Megaphone size={15} className="text-indigo-600" />
          Nueva campaña
        </summary>
        <form action={crearCampanaAction} className="flex flex-col gap-4 border-t border-slate-100 p-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="nombre" className="text-sm font-medium text-slate-700">
              Nombre de la campaña
            </label>
            <input
              id="nombre"
              name="nombre"
              required
              placeholder="Ej: Cobros septiembre"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="contactos" className="text-sm font-medium text-slate-700">
              Números a llamar
            </label>
            <CampanaContactosInput etiquetas={empresa.etiquetas_disponibles} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="reintentos_max" className="text-sm font-medium text-slate-700">
                Reintentos máximos
              </label>
              <input
                id="reintentos_max"
                name="reintentos_max"
                type="number"
                min={0}
                defaultValue={2}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="horas_entre_reintentos" className="text-sm font-medium text-slate-700">
                Horas entre reintentos
              </label>
              <input
                id="horas_entre_reintentos"
                name="horas_entre_reintentos"
                type="number"
                min={0.1}
                step={0.5}
                defaultValue={4}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="prompt_override" className="text-sm font-medium text-slate-700">
              Guion específico de esta campaña (opcional)
            </label>
            <textarea
              id="prompt_override"
              name="prompt_override"
              rows={3}
              placeholder="Si lo dejas vacío, usa el guion normal configurado en Configuración."
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            className="ts-brand-button self-start rounded-md px-5 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            Crear campaña
          </button>
        </form>
      </details>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Progreso</th>
              <th className="px-4 py-2 font-medium">Creada</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {campanas.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/campanas/${c.id}`} className="font-medium text-indigo-700 hover:underline">
                    {c.nombre}
                  </Link>
                </td>
                <td className="px-4 py-3">{ETIQUETAS_ESTADO[c.estado] ?? c.estado}</td>
                <td className="px-4 py-3 text-slate-600">
                  {c.completados}/{c.total_contactos} completados
                  {Number(c.fallidos) > 0 ? ` · ${c.fallidos} fallidos` : ""}
                </td>
                <td className="px-4 py-3 text-slate-500">{formatFechaHora(c.creado_en)}</td>
                <td className="px-4 py-3 text-right">
                  {c.estado === "en_curso" ? (
                    <BotonAccion
                      accion={pausarCampanaAction.bind(null, c.id)}
                      mensajeExito="Pausada."
                      className="text-sm text-amber-700 hover:underline"
                    >
                      Pausar
                    </BotonAccion>
                  ) : c.estado !== "completada" ? (
                    <BotonAccion
                      accion={iniciarCampanaAction.bind(null, c.id)}
                      mensajeExito="Iniciada."
                      className="text-sm text-indigo-700 hover:underline"
                    >
                      {c.estado === "borrador" ? "Iniciar" : "Reanudar"}
                    </BotonAccion>
                  ) : null}
                </td>
              </tr>
            ))}
            {campanas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No hay campañas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
