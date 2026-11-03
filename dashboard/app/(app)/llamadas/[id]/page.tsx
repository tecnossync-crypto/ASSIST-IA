import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Phone,
  ClipboardList,
  Clock3,
  FileText,
  Forward,
  Hash,
  Lightbulb,
  MessageSquare,
  Plug,
  Target,
  User,
  Volume2,
} from "lucide-react";
import { obtenerLlamada } from "@/lib/api";
import { obtenerSesion } from "@/lib/session";
import { formatFechaHora, formatDuracion } from "@/lib/format";
import { MonitoreoLlamada } from "@/components/MonitoreoLlamada";
import { IconoDireccion, InsigniaEstadoLlamada, Insignia } from "@/components/ui";

const CAJA = "rounded-xl border border-edge bg-surface shadow-sm";

function Dato({ Icon, etiqueta, children }: { Icon: typeof Clock3; etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted ring-1 ring-edge">
        <Icon size={13} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{etiqueta}</p>
        <div className="truncate text-sm font-medium text-ink">{children}</div>
      </div>
    </div>
  );
}

function Bloque({ Icon, titulo, texto }: { Icon: typeof Target; titulo: string; texto: string | null | undefined }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3 ring-1 ring-edge">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <Icon size={12} />
        {titulo}
      </p>
      <p className={"text-sm leading-relaxed " + (texto ? "text-ink" : "text-muted")}>{texto || "Sin información."}</p>
    </div>
  );
}

export default async function LlamadaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [data, sesion] = await Promise.all([obtenerLlamada(id).catch(() => null), obtenerSesion()]);
  if (!data) notFound();

  const { llamada, transcripcion, grabacion, datos, origen_api, departamento_nombre } = data;

  // Un agente (rol operador) solo puede ver llamadas de su propia cola —
  // aunque adivine el id por la URL, si no es de su cola no existe para él.
  if (sesion?.rol === "operador" && llamada.cola_id !== sesion?.colaId) {
    notFound();
  }

  const puedeMonitorear =
    (sesion?.rol === "admin" || sesion?.rol === "supervisor") &&
    llamada.estado === "en_curso" &&
    llamada.agente_call_sid;

  const entrante = llamada.direccion === "entrante";
  const cliente = entrante ? llamada.numero_origen : llamada.numero_destino;
  const turnos = transcripcion?.texto_completo ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Link href="/llamadas" className="flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
        <ArrowLeft size={14} />
        Volver a llamadas
      </Link>

      {/* Cabecera */}
      <section className={`${CAJA} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-md shadow-indigo-500/25">
              <User size={20} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-lg font-semibold tracking-tight text-ink">{cliente}</h1>
                <InsigniaEstadoLlamada estado={llamada.estado} />
                {llamada.transferida && (
                  <Insignia tono="ambar">
                    <Forward size={11} className="-ml-0.5" />
                    {llamada.transferencia_destino ? `Pasó a ${llamada.transferencia_destino}` : "Pasó a un asesor"}
                  </Insignia>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted">
                Llamada {entrante ? "entrante" : "saliente"} · {formatFechaHora(llamada.iniciada_en)}
              </p>
            </div>
          </div>
          {puedeMonitorear && <MonitoreoLlamada llamadaId={llamada.id} />}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-edge pt-4 sm:grid-cols-4">
          <Dato Icon={Clock3} etiqueta="Duración">
            <span className="font-mono">{formatDuracion(llamada.duracion_segundos)}</span>
          </Dato>
          <Dato Icon={Phone} etiqueta="Dirección">
            <IconoDireccion direccion={llamada.direccion} titulo />
          </Dato>
          <Dato Icon={Target} etiqueta="Departamento">
            {departamento_nombre ?? <span className="font-normal text-muted">Sin departamento</span>}
          </Dato>
          <Dato Icon={Plug} etiqueta="Origen">
            {origen_api ? (
              <span title={origen_api.regla_nombre ? `Regla: ${origen_api.regla_nombre}` : undefined}>
                API{origen_api.origen ? ` · ${origen_api.origen}` : ""}
              </span>
            ) : (
              <span className="font-normal text-muted">{entrante ? "Llamada recibida" : "Marcada desde la plataforma"}</span>
            )}
          </Dato>
        </div>
        {origen_api?.regla_nombre && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <Lightbulb size={12} />
            Se aplicó la regla <strong className="font-medium text-ink-2">{origen_api.regla_nombre}</strong>
            {origen_api.departamento_asignado ? ` · departamento ${origen_api.departamento_asignado}` : ""}.
          </p>
        )}
      </section>

      {/* Grabación */}
      <section className={`${CAJA} p-5`}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Volume2 size={15} className="text-indigo-600 dark:text-indigo-300" />
          Grabación
        </h2>
        {grabacion?.audioUrl ? (
          <audio controls src={grabacion.audioUrl} className="w-full" />
        ) : (
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-muted ring-1 ring-edge">
            {grabacion ? "No se pudo generar el enlace de reproducción." : "La grabación aún no está disponible."}
          </p>
        )}
        {grabacion && (
          <p className="mt-2.5 flex items-start gap-1.5 break-all text-[11px] text-muted">
            <Hash size={12} className="mt-0.5 flex-shrink-0" />
            Hash de integridad: <span className="font-mono">{grabacion.hash_integridad}</span>
          </p>
        )}
      </section>

      {/* Datos recolectados */}
      {datos.length > 0 && (
        <section className={`${CAJA} p-5`}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <ClipboardList size={15} className="text-indigo-600 dark:text-indigo-300" />
            Datos recolectados
          </h2>
          <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {datos.map((d, i) => (
              <div key={i} className="rounded-lg bg-surface-2 px-3 py-2 ring-1 ring-edge">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{d.campo}</dt>
                <dd className="break-words text-sm font-medium text-ink">{d.valor}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Resumen de la IA */}
        <section className={`${CAJA} p-5`}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <FileText size={15} className="text-indigo-600 dark:text-indigo-300" />
            Resumen de la IA
          </h2>
          {transcripcion ? (
            <div className="flex flex-col gap-2.5">
              <Bloque Icon={Target} titulo="Motivo" texto={transcripcion.resumen_motivo} />
              <Bloque Icon={MessageSquare} titulo="Solicitud" texto={transcripcion.resumen_solicitud} />
              <Bloque Icon={Forward} titulo="Resultado" texto={transcripcion.resumen_resultado} />
              <Bloque Icon={Lightbulb} titulo="Acción pendiente" texto={transcripcion.accion_pendiente} />
            </div>
          ) : (
            <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-muted ring-1 ring-edge">
              Aún no hay resumen para esta llamada.
            </p>
          )}
        </section>

        {/* Transcripción como conversación */}
        <section className={`${CAJA} flex flex-col p-5`}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <MessageSquare size={15} className="text-indigo-600 dark:text-indigo-300" />
            Transcripción
            {turnos.length > 0 && <span className="text-xs font-normal text-muted">· {turnos.length} mensajes</span>}
          </h2>
          {turnos.length > 0 ? (
            <ol className="flex max-h-[34rem] flex-col gap-2.5 overflow-y-auto pr-1">
              {turnos.map((turno, i) => {
                const bot = turno.hablante === "agente";
                return (
                  <li key={i} className={"flex flex-col " + (bot ? "items-start" : "items-end")}>
                    <span className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-medium text-muted">
                      {bot ? <Bot size={11} /> : <User size={11} />}
                      {bot ? "Asistente" : "Cliente"}
                    </span>
                    <p
                      className={
                        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed " +
                        (bot
                          ? "rounded-tl-sm bg-surface-2 text-ink ring-1 ring-edge"
                          : "rounded-tr-sm bg-indigo-600 text-white")
                      }
                    >
                      {turno.texto}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-muted ring-1 ring-edge">
              Sin transcripción todavía.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
