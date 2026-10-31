import Link from "next/link";
import { Phone, PhoneIncoming, PhoneOutgoing, UserCircle2, MessageSquareText, Lightbulb, ExternalLink } from "lucide-react";
import type { ConversacionCliente, LlamadaConversacion } from "@/lib/api";
import { ControlSeguimiento } from "@/components/ControlSeguimiento";
import { formatFechaHora } from "@/lib/format";

interface Turno {
  hablante: string;
  texto: string;
  timestamp?: string;
}

function turnosDe(raw: unknown): Turno[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? (v as Turno[]).filter((t) => t && typeof t.texto === "string" && t.texto.trim()) : [];
}

function hora(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function duracion(seg: number | null): string {
  if (!seg) return "";
  return seg < 60 ? `${seg} s` : `${Math.round(seg / 60)} min`;
}

const ANIMO: Record<string, string> = { positiva: "Buen ánimo", neutral: "Neutral", negativa: "Molesto" };

function Burbuja({ t }: { t: Turno }) {
  const cliente = t.hablante === "cliente";
  return (
    <div className={`flex ${cliente ? "justify-start" : "justify-end"}`}>
      <div
        className={
          "max-w-[82%] rounded-2xl px-3.5 py-2 text-sm leading-snug shadow-sm " +
          (cliente
            ? "rounded-bl-sm border border-edge bg-surface text-ink"
            : "rounded-br-sm bg-indigo-600 text-white")
        }
      >
        <div className={`mb-0.5 text-[10px] font-medium uppercase tracking-wide ${cliente ? "text-muted" : "text-indigo-100"}`}>
          {cliente ? "Cliente" : "Asistente IA"}
          {hora(t.timestamp) && ` · ${hora(t.timestamp)}`}
        </div>
        {t.texto}
      </div>
    </div>
  );
}

function BloqueLlamada({ l }: { l: LlamadaConversacion }) {
  const turnos = turnosDe(l.texto_completo);
  const Icono = l.direccion === "saliente" ? PhoneOutgoing : PhoneIncoming;
  const sinConversacion = turnos.length === 0;
  const etiquetas = [
    l.direccion === "saliente" ? "Llamada saliente" : "Llamada entrante",
    duracion(l.duracion_segundos),
    l.transferida ? "transferida a un asesor" : "",
    l.resultado_automatico === "buzon" ? "buzón de voz" : l.resultado_automatico === "numero_inexistente" ? "número no disponible" : "",
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-center gap-2">
        <span className="h-px flex-1 bg-edge" />
        <Link
          href={`/llamadas/${l.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface px-3 py-1 text-[11px] text-muted hover:border-indigo-300 hover:text-indigo-600"
        >
          <Icono size={11} />
          {formatFechaHora(l.iniciada_en)} · {etiquetas.join(" · ")}
          <ExternalLink size={10} />
        </Link>
        <span className="h-px flex-1 bg-edge" />
      </div>

      {sinConversacion ? (
        <p className="text-center text-xs italic text-muted">
          {l.resultado_automatico === "buzon" || l.estado !== "completada" ? "No hubo conversación (no contestó)." : "Sin transcripción de esta llamada."}
        </p>
      ) : (
        turnos.map((t, i) => <Burbuja key={i} t={t} />)
      )}

      {(l.resumen_solicitud || l.resumen_motivo || l.resumen_resultado || l.accion_pendiente) && (
        <div className="mx-auto w-full max-w-[92%] rounded-xl border border-dashed border-edge bg-surface/60 p-3 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-ink">
            <MessageSquareText size={12} />
            Resumen de la llamada
            {l.satisfaccion && ANIMO[l.satisfaccion] && <span className="ml-auto font-normal text-muted">{ANIMO[l.satisfaccion]}</span>}
          </div>
          {(l.resumen_solicitud || l.resumen_motivo) && (
            <p className="text-ink-2">
              <strong>Necesita:</strong> {l.resumen_solicitud || l.resumen_motivo}
            </p>
          )}
          {l.resumen_resultado && (
            <p className="text-ink-2">
              <strong>Resultado:</strong> {l.resumen_resultado}
            </p>
          )}
          {l.accion_pendiente && (
            <p className="mt-1 flex items-start gap-1.5 text-amber-800 dark:text-amber-200">
              <Lightbulb size={12} className="mt-0.5 flex-shrink-0" />
              <span>
                <strong>Pendiente:</strong> {l.accion_pendiente}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function PanelConversacion({ data }: { data: ConversacionCliente }) {
  const c = data.contacto;
  const nombre = [c.nombre, c.apellido].filter(Boolean).join(" ") || c.numero;
  const ultimaConResumen = [...data.llamadas].reverse().find((l) => l.accion_pendiente?.trim());
  const propietario = c.propietario_nombre ?? c.propietario_externo;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-edge px-4 py-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white">
          {nombre.trim().slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/contactos/${c.id}`} className="block truncate text-sm font-semibold text-ink hover:text-indigo-600 hover:underline">
            {nombre}
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Phone size={11} />
              {c.numero}
            </span>
            <span className="inline-flex items-center gap-1">
              <UserCircle2 size={11} />
              {propietario ? `Propietario: ${propietario}` : "Sin propietario"}
              {!c.propietario_nombre && c.propietario_externo && " (del CRM, sin usuario)"}
            </span>
          </div>
        </div>
      </header>

      <div className="border-b border-edge p-3">
        <ControlSeguimiento
          key={`${c.id}-${c.seguimiento_estado}-${c.seguimiento_fecha}`}
          contactoId={c.id}
          estado={c.seguimiento_estado}
          fecha={c.seguimiento_fecha}
          nota={c.seguimiento_nota}
          origen={c.seguimiento_origen}
          accionPendiente={ultimaConResumen?.accion_pendiente ?? null}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto bg-slate-50/60 px-4 py-4 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-5">
        {data.llamadas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Este cliente todavía no tiene llamadas.</p>
        ) : (
          data.llamadas.map((l) => <BloqueLlamada key={l.id} l={l} />)
        )}
        </div>
      </div>
    </div>
  );
}
