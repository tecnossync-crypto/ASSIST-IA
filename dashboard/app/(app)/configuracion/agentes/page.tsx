import Link from "next/link";
import { Headset, KeyRound, Circle, Phone, Download, Puzzle } from "lucide-react";
import { listarAgentes, listarColas } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { BotonAccion } from "@/components/BotonAccion";
import { NuevoAgenteForm } from "@/components/NuevoAgenteForm";
import { CambiarPasswordAgente } from "@/components/CambiarPasswordAgente";
import { Configurar2FA } from "@/components/Configurar2FA";
import { AvatarUsuario } from "@/components/AvatarUsuario";
import { DireccionExtension } from "@/components/DireccionExtension";
import { EditorIdExternoAgente } from "@/components/EditorIdExternoAgente";
import { eliminarAgenteAction } from "./actions";

const ETIQUETAS_ROL: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  operador: "Agente",
};

const ESTADO_PRESENCIA: Record<string, { etiqueta: string; punto: string }> = {
  disponible: { etiqueta: "Disponible ahora", punto: "fill-emerald-500 text-emerald-500" },
  descanso: { etiqueta: "En descanso", punto: "fill-amber-500 text-amber-500" },
  desconectado: { etiqueta: "Desconectado", punto: "fill-slate-300 text-slate-300" },
};

export default async function AgentesPage() {
  const [agentes, colas] = await Promise.all([listarAgentes(), listarColas()]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Headset}
        titulo="Agentes"
        descripcion="Quiénes reciben las llamadas normales desde el softphone del dashboard, organizados por cola."
      />

      <p className="rounded-lg border border-dashed border-edge p-3 text-xs text-muted">
        Las colas, su reparto y la central telefónica están ahora en{" "}
        <Link href="/configuracion/enrutamiento" className="text-indigo-700 hover:underline">
          Configuración → Enrutamiento
        </Link>
        . Aquí asignas cada agente a su cola al crearlo.
      </p>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Puzzle size={16} className="text-indigo-600" />
          Extensión de teléfono para el navegador
        </div>
        <p className="mb-4 text-xs text-muted">
          Abre el panel de teléfono en una ventana aparte del navegador — para dejarlo a mano mientras se trabaja
          en otras pestañas o programas, sin tener que dejar abierta toda la plataforma. Cada agente la instala en
          su propia computadora (instrucciones incluidas al descomprimir).
        </p>
        <a
          href="/descargas/extension-voz-ia.zip"
          download
          className="ts-brand-button inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30"
        >
          <Download size={14} />
          Descargar extensión (.zip)
        </a>
        <DireccionExtension />
      </section>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <KeyRound size={16} className="text-indigo-600" />
          Nuevo usuario
        </div>
        <NuevoAgenteForm colas={colas} />
        <p className="mt-3 text-xs text-muted">
          Agente: entra al softphone con PIN. Supervisor: ve todo excepto Configuración (incluye Supervisión en
          vivo). Administrador: acceso total.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink-2">Usuarios registrados</h2>
        {agentes.length === 0 && (
          <p className="rounded-lg border border-dashed border-edge p-4 text-sm text-muted">
            No hay usuarios todavía.
          </p>
        )}
        {agentes.map((a) => (
          <div key={a.id} className="flex flex-col gap-3 rounded-lg border border-edge bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AvatarUsuario id={a.id} nombre={a.nombre} tieneAvatar={a.tiene_avatar} />
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <Circle
                      size={8}
                      className={(ESTADO_PRESENCIA[a.estado_presencia] ?? ESTADO_PRESENCIA.desconectado).punto}
                    />
                    {a.nombre}
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      {ETIQUETAS_ROL[a.rol] ?? a.rol}
                    </span>
                    {a.totp_habilitado && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        2FA activo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {a.email}
                    {a.telefono && (
                      <>
                        {" · "}
                        <span className="inline-flex items-center gap-1">
                          <Phone size={10} />
                          {a.telefono}
                        </span>
                      </>
                    )}
                    {" · "}
                    {a.tiene_acceso_dashboard ? "con acceso" : "sin contraseña (no puede entrar)"} ·{" "}
                    {a.cola_nombre ?? "Sin cola"} ·{" "}
                    {(ESTADO_PRESENCIA[a.estado_presencia] ?? ESTADO_PRESENCIA.desconectado).etiqueta}
                  </p>
                </div>
              </div>
              <BotonAccion
                accion={eliminarAgenteAction.bind(null, a.id)}
                mensajeExito="Eliminado."
                mensajeConfirmar={`¿Eliminar al agente "${a.nombre}"?`}
              >
                Eliminar
              </BotonAccion>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-edge pt-3">
              <CambiarPasswordAgente id={a.id} nombre={a.nombre} tieneAcceso={a.tiene_acceso_dashboard} />
              {a.tiene_acceso_dashboard && <Configurar2FA id={a.id} habilitado={a.totp_habilitado} />}
              <EditorIdExternoAgente id={a.id} valorInicial={a.id_externo} />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
