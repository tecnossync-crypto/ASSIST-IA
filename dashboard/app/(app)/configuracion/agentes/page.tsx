import Link from "next/link";
import { Headset, KeyRound, Phone, Download, Puzzle, Users, UserPlus, Mail, Building2, ShieldCheck, Fingerprint, Link2 } from "lucide-react";
import { listarAgentes, listarColas, listarRoles } from "@/lib/api";
import { ConfiguracionHeader } from "@/components/ConfiguracionHeader";
import { BotonAccion } from "@/components/BotonAccion";
import { NuevoAgenteForm } from "@/components/NuevoAgenteForm";
import { CambiarPasswordAgente } from "@/components/CambiarPasswordAgente";
import { Configurar2FA } from "@/components/Configurar2FA";
import { AvatarUsuario } from "@/components/AvatarUsuario";
import { DireccionExtension } from "@/components/DireccionExtension";
import { EditorIdsPlataformas } from "@/components/EditorIdsPlataformas";
import { ColaAgenteSelect } from "@/components/ColaAgenteSelect";
import { RolAgenteSelect } from "@/components/RolAgenteSelect";
import { PestanasConfig, type PestanaConfig } from "@/components/PestanasConfig";
import { eliminarAgenteAction } from "./actions";

const ESTADO_PRESENCIA: Record<string, { etiqueta: string; punto: string; chip: string }> = {
  disponible: {
    etiqueta: "Disponible",
    punto: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  descanso: {
    etiqueta: "En descanso",
    punto: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  desconectado: {
    etiqueta: "Desconectado",
    punto: "bg-slate-400",
    chip: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  },
};

const PESTANAS: PestanaConfig[] = [
  { id: "usuarios", etiqueta: "Usuarios", Icon: Users },
  { id: "nuevo", etiqueta: "Nuevo usuario", Icon: UserPlus },
  { id: "extension", etiqueta: "Extensión del navegador", Icon: Puzzle },
];

function Dato({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="rounded-lg border border-edge bg-surface px-4 py-3">
      <div className="text-xs text-muted">{etiqueta}</div>
      <div className="mt-0.5 text-xl font-semibold text-ink">{valor}</div>
    </div>
  );
}

function Bloque({ Icon, titulo, children }: { Icon: typeof KeyRound; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <Icon size={12} />
        {titulo}
      </h4>
      {children}
    </div>
  );
}

export default async function AgentesPage({ searchParams }: { searchParams: Promise<{ seccion?: string }> }) {
  const { seccion } = await searchParams;
  const activa = PESTANAS.some((p) => p.id === seccion) ? (seccion as string) : "usuarios";
  const [agentes, colas, roles] = await Promise.all([listarAgentes(), listarColas(), listarRoles()]);
  const nombreRol = new Map(roles.map((r) => [r.clave, r.nombre]));
  const rolesOpciones = roles.map((r) => ({ clave: r.clave, nombre: r.nombre }));

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <ConfiguracionHeader
        Icon={Headset}
        titulo="Agentes y usuarios"
        descripcion="Las personas de tu equipo: su acceso, su rol y departamento, y cómo las identifica cada plataforma (SalesIQ, el CRM…)."
      />

      <PestanasConfig basePath="/configuracion/agentes" pestanas={PESTANAS} activa={activa} />

      {activa === "usuarios" && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato etiqueta="Usuarios" valor={agentes.length} />
            <Dato etiqueta="Disponibles ahora" valor={agentes.filter((a) => a.estado_presencia === "disponible").length} />
            <Dato etiqueta="Sin acceso al dashboard" valor={agentes.filter((a) => !a.tiene_acceso_dashboard).length} />
            <Dato etiqueta="Con 2FA" valor={agentes.filter((a) => a.totp_habilitado).length} />
          </div>

          <p className="rounded-lg border border-dashed border-edge p-3 text-xs text-muted">
            Las colas, su reparto y la central telefónica están en{" "}
            <Link href="/configuracion/enrutamiento?seccion=departamentos" className="text-indigo-700 hover:underline">
              Configuración → Enrutamiento
            </Link>
            . Los permisos de cada rol, en{" "}
            <Link href="/configuracion/roles" className="text-indigo-700 hover:underline">
              Roles y permisos
            </Link>
            .
          </p>

          {agentes.length === 0 && (
            <p className="rounded-lg border border-dashed border-edge p-6 text-center text-sm text-muted">No hay usuarios todavía.</p>
          )}

          <div className="flex flex-col gap-4">
            {agentes.map((a) => {
              const estado = ESTADO_PRESENCIA[a.estado_presencia] ?? ESTADO_PRESENCIA.desconectado;
              return (
                <article key={a.id} className="overflow-hidden rounded-xl border border-edge bg-surface shadow-sm">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <AvatarUsuario id={a.id} nombre={a.nombre} tieneAvatar={a.tiene_avatar} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-ink">{a.nombre}</h3>
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                            {nombreRol.get(a.rol) ?? a.rol}
                          </span>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${estado.chip}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${estado.punto}`} />
                            {estado.etiqueta}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Mail size={11} />
                            {a.email}
                          </span>
                          {a.telefono && (
                            <span className="inline-flex items-center gap-1">
                              <Phone size={11} />
                              {a.telefono}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Building2 size={11} />
                            {a.cola_nombre ?? "Sin departamento"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <BotonAccion
                      accion={eliminarAgenteAction.bind(null, a.id)}
                      mensajeExito="Eliminado."
                      mensajeConfirmar={`¿Eliminar al agente "${a.nombre}"?`}
                    >
                      Eliminar
                    </BotonAccion>
                  </header>

                  <div className="grid gap-x-8 gap-y-5 px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
                    <Bloque Icon={ShieldCheck} titulo="Acceso y seguridad">
                      <p className="text-xs text-ink-2">
                        {a.tiene_acceso_dashboard ? "Puede entrar al dashboard." : "Sin contraseña: no puede entrar al dashboard."}
                        {a.totp_habilitado && " Verificación en dos pasos activa."}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <CambiarPasswordAgente id={a.id} nombre={a.nombre} tieneAcceso={a.tiene_acceso_dashboard} />
                        {a.tiene_acceso_dashboard && <Configurar2FA id={a.id} habilitado={a.totp_habilitado} />}
                      </div>
                    </Bloque>

                    <Bloque Icon={Fingerprint} titulo="Rol y departamento">
                      <div className="flex flex-wrap items-center gap-3">
                        <RolAgenteSelect agenteId={a.id} rolActual={a.rol} roles={rolesOpciones} />
                        <ColaAgenteSelect agenteId={a.id} colaActual={a.cola_id} colas={colas.map((c) => ({ id: c.id, nombre: c.nombre }))} />
                      </div>
                    </Bloque>

                    <div className="max-w-2xl md:col-span-2 xl:col-span-3">
                      <Bloque Icon={Link2} titulo="Identificadores por plataforma">
                        <EditorIdsPlataformas id={a.id} idGeneral={a.id_externo} idsIniciales={a.ids_externos ?? []} />
                      </Bloque>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {activa === "nuevo" && (
        <section className="rounded-xl border border-edge bg-surface p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
            <KeyRound size={16} className="text-indigo-600" />
            Nuevo usuario
          </div>
          <NuevoAgenteForm colas={colas} roles={rolesOpciones} />
          <p className="mt-3 text-xs text-muted">
            Cada usuario tiene un rol que define qué ve y qué puede hacer. Edita los permisos de cada rol, o crea roles
            nuevos, en{" "}
            <Link href="/configuracion/roles" className="text-indigo-700 hover:underline">
              Configuración → Roles y permisos
            </Link>
            . Después de crearlo, agrega sus identificadores por plataforma en la pestaña Usuarios.
          </p>
        </section>
      )}

      {activa === "extension" && (
        <section className="rounded-xl border border-edge bg-surface p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
            <Puzzle size={16} className="text-indigo-600" />
            Extensión de teléfono para el navegador
          </div>
          <p className="mb-4 text-xs text-muted">
            Abre el panel de teléfono en una ventana aparte del navegador — para dejarlo a mano mientras se trabaja en
            otras pestañas o programas, sin tener que dejar abierta toda la plataforma. Cada agente la instala en su
            propia computadora (instrucciones incluidas al descomprimir).
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
      )}
    </div>
  );
}
