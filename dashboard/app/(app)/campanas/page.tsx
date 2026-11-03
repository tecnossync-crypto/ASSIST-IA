import Link from "next/link";
import { ChevronDown, Megaphone, Pause, Play, Plus, Rocket } from "lucide-react";
import { listarCampanas, obtenerEmpresa } from "@/lib/api";
import { formatFechaHora } from "@/lib/format";
import { crearCampanaAction, iniciarCampanaAction, pausarCampanaAction } from "./actions";
import { CampanaContactosInput } from "@/components/CampanaContactosInput";
import { BotonAccion } from "@/components/BotonAccion";
import { EncabezadoPagina, EstadoVacio, InsigniaEstadoCampana, Metrica, TarjetaTabla, TH } from "@/components/ui";

const CAMPO =
  "w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";
const ETIQUETA = "text-sm font-medium text-ink-2";

export default async function CampanasPage() {
  const [campanas, empresa] = await Promise.all([listarCampanas(), obtenerEmpresa()]);

  const activas = campanas.filter((c) => c.estado === "en_curso").length;
  const totalContactos = campanas.reduce((s, c) => s + Number(c.total_contactos), 0);
  const completados = campanas.reduce((s, c) => s + Number(c.completados), 0);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPagina
        Icon={Megaphone}
        titulo="Campañas"
        descripcion="Llamadas salientes masivas con reintentos automáticos si no contestan."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica Icon={Megaphone} etiqueta="Campañas" valor={campanas.length} />
        <Metrica Icon={Rocket} tono="verde" etiqueta="En curso" valor={activas} />
        <Metrica Icon={Play} tono="violeta" etiqueta="Contactos totales" valor={totalContactos} />
        <Metrica
          Icon={Pause}
          tono="ambar"
          etiqueta="Completados"
          valor={completados}
          detalle={totalContactos > 0 ? `${Math.round((completados / totalContactos) * 100)}% del total` : undefined}
        />
      </div>

      <details className="group rounded-xl border border-edge bg-surface shadow-sm">
        <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-2 px-5 py-3.5">
          <span className="flex items-center gap-2.5 text-sm font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Plus size={16} />
            </span>
            Nueva campaña
          </span>
          <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" />
        </summary>
        <form action={crearCampanaAction} className="flex flex-col gap-4 border-t border-edge p-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nombre" className={ETIQUETA}>
              Nombre de la campaña
            </label>
            <input id="nombre" name="nombre" required placeholder="Ej: Cobros septiembre" className={CAMPO} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="contactos" className={ETIQUETA}>
              Números a llamar
            </label>
            <CampanaContactosInput etiquetas={empresa.etiquetas_disponibles} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reintentos_max" className={ETIQUETA}>
                Reintentos máximos
              </label>
              <input id="reintentos_max" name="reintentos_max" type="number" min={0} defaultValue={2} className={CAMPO} />
              <p className="text-xs text-muted">Cuántas veces más se llama a quien no contesta.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="horas_entre_reintentos" className={ETIQUETA}>
                Horas entre reintentos
              </label>
              <input
                id="horas_entre_reintentos"
                name="horas_entre_reintentos"
                type="number"
                min={0.1}
                step={0.5}
                defaultValue={4}
                className={CAMPO}
              />
              <p className="text-xs text-muted">Espera entre un intento y el siguiente.</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="prompt_override" className={ETIQUETA}>
              Guion específico de esta campaña <span className="font-normal text-muted">(opcional)</span>
            </label>
            <textarea
              id="prompt_override"
              name="prompt_override"
              rows={3}
              placeholder="Si lo dejas vacío, usa el guion normal configurado en Configuración."
              className={`${CAMPO} font-mono text-xs leading-relaxed`}
            />
          </div>

          <button
            type="submit"
            className="ts-brand-button self-start rounded-lg px-5 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
          >
            Crear campaña
          </button>
        </form>
      </details>

      <TarjetaTabla>
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className={TH}>Campaña</th>
              <th className={TH}>Estado</th>
              <th className={`${TH} w-1/3`}>Progreso</th>
              <th className={TH}>Creada</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {campanas.map((c) => {
              const total = Number(c.total_contactos);
              const hechos = Number(c.completados);
              const fallidos = Number(c.fallidos);
              const pctOk = total > 0 ? (hechos / total) * 100 : 0;
              const pctFallo = total > 0 ? (fallidos / total) * 100 : 0;
              return (
                <tr key={c.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/campanas/${c.id}`} className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                      {c.nombre}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <InsigniaEstadoCampana estado={c.estado} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-edge">
                      <div className="bg-emerald-500" style={{ width: `${pctOk}%` }} />
                      <div className="bg-red-400" style={{ width: `${pctFallo}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {hechos}/{total} completados{fallidos > 0 ? ` · ${fallidos} fallidos` : ""}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{formatFechaHora(c.creado_en)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {c.estado === "en_curso" ? (
                      <BotonAccion
                        accion={pausarCampanaAction.bind(null, c.id)}
                        mensajeExito="Pausada."
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                      >
                        Pausar
                      </BotonAccion>
                    ) : c.estado !== "completada" ? (
                      <BotonAccion
                        accion={iniciarCampanaAction.bind(null, c.id)}
                        mensajeExito="Iniciada."
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                      >
                        {c.estado === "borrador" ? "Iniciar" : "Reanudar"}
                      </BotonAccion>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {campanas.length === 0 && (
          <EstadoVacio
            Icon={Megaphone}
            titulo="Todavía no hay campañas"
            descripcion="Crea la primera con el botón «Nueva campaña»: eliges los números, los reintentos y la IA los llama."
          />
        )}
      </TarjetaTabla>
    </div>
  );
}
