"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  CheckCircle2,
  Pencil,
  Loader2,
  Clock,
} from "lucide-react";
import type { ReglaApiLlamadas, ResultadoPruebaRegla } from "@/lib/api";
import {
  crearReglaAction,
  editarReglaAction,
  probarReglasAction,
  alternarReglaAction,
  eliminarReglaAction,
  type EstadoRegla,
} from "@/app/(app)/configuracion/integraciones/actions";
import { BotonAccion } from "@/components/BotonAccion";

const CAMPO =
  "w-full rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50";

const ETIQUETAS_OPERADOR: Record<string, string> = {
  igual: "es igual a",
  contiene: "contiene",
  existe: "viene con algún valor",
};

type Cuando = "ahora" | "espera" | "hora" | "fecha";

function cuandoDe(r?: ReglaApiLlamadas): Cuando {
  if (!r) return "ahora";
  if (r.hora_del_dia) return "hora";
  if (r.fecha_programada) return "fecha";
  if ((r.retraso_minutos ?? 0) > 0) return "espera";
  return "ahora";
}

// ISO -> valor de <input type="datetime-local"> en la hora del navegador.
function aInputLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function esperaInicial(minutos: number | null): { cantidad: string; unidad: string } {
  const m = minutos ?? 0;
  if (m <= 0) return { cantidad: "30", unidad: "minutos" };
  if (m % 1440 === 0) return { cantidad: String(m / 1440), unidad: "dias" };
  if (m % 60 === 0) return { cantidad: String(m / 60), unidad: "horas" };
  return { cantidad: String(m), unidad: "minutos" };
}

function describirHorario(r: ReglaApiLlamadas): string {
  if (r.hora_del_dia) return `llama todos los días a las ${r.hora_del_dia}`;
  if (r.fecha_programada) {
    return `llama el ${new Date(r.fecha_programada).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}`;
  }
  const m = r.retraso_minutos ?? 0;
  if (m <= 0) return "llama de inmediato";
  if (m % 1440 === 0) return `llama a los ${m / 1440} día(s)`;
  if (m % 60 === 0) return `llama a las ${m / 60} hora(s)`;
  return `llama a los ${m} min`;
}

export function ReglasApiLlamadas({ reglas }: { reglas: ReglaApiLlamadas[] }) {
  const [mostrarForm, setMostrarForm] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {reglas.length === 0 && !mostrarForm && (
        <p className="rounded-lg border border-dashed border-edge py-6 text-center text-sm text-muted">
          Sin reglas todavía — se usa el &quot;prompt&quot; que mande la plataforma externa tal cual, si mandó uno.
        </p>
      )}

      {reglas.length > 0 && (
        <div className="flex flex-col gap-3">
          {reglas.map((r) => (
            <TarjetaRegla key={r.id} regla={r} />
          ))}
        </div>
      )}

      {mostrarForm ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/5">
          <p className="mb-3 text-sm font-semibold text-ink">Nueva regla</p>
          <FormularioRegla onListo={() => setMostrarForm(false)} onCancelar={() => setMostrarForm(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMostrarForm(true)}
          className="flex w-fit items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-surface-2"
        >
          <Plus size={14} /> Nueva regla
        </button>
      )}

      {reglas.length > 0 && <ProbadorReglas />}
    </div>
  );
}

/**
 * Formulario de una regla, para crear (sin `regla`) o editar (con `regla`).
 * Los campos son controlados y se envía con onSubmit (no con `action=`): así,
 * si el servidor rechaza algo, no se pierde lo que ya escribiste.
 */
function FormularioRegla({
  regla,
  onListo,
  onCancelar,
}: {
  regla?: ReglaApiLlamadas;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(regla?.nombre ?? "");
  const [campo, setCampo] = useState(regla?.campo ?? "");
  const [operador, setOperador] = useState<string>(regla?.operador ?? "igual");
  const [valor, setValor] = useState(regla?.valor ?? "");
  const [prompt, setPrompt] = useState(regla?.prompt_personalizado ?? "");
  const [cuando, setCuando] = useState<Cuando>(cuandoDe(regla));
  const [hora, setHora] = useState(regla?.hora_del_dia ?? "12:00");
  const espera = esperaInicial(regla?.retraso_minutos ?? null);
  const [cantidad, setCantidad] = useState(espera.cantidad);
  const [unidad, setUnidad] = useState(espera.unidad);
  const [fechaLocal, setFechaLocal] = useState(aInputLocal(regla?.fecha_programada ?? null));
  // Zona horaria de quien configura la regla (la "hora del día" se entiende en ella).
  const [zona, setZona] = useState(regla?.zona_horaria ?? "");
  useEffect(() => {
    if (!regla?.zona_horaria) setZona(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  }, [regla?.zona_horaria]);

  const [error, setError] = useState("");
  const [guardando, iniciar] = useTransition();

  // El input datetime-local no trae zona horaria; se convierte aquí, en el
  // navegador de quien configura, a ISO con su zona — así la hora que elige
  // es la que se respeta, no la del servidor.
  const fechaIso = fechaLocal && !Number.isNaN(new Date(fechaLocal).getTime()) ? new Date(fechaLocal).toISOString() : "";

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      const r: EstadoRegla = regla ? await editarReglaAction(null, fd) : await crearReglaAction(null, fd);
      if (r.error) setError(r.error);
      else onListo();
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {regla && <input type="hidden" name="id" value={regla.id} />}

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Nombre de la regla</label>
        <input
          name="nombre"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Zoho SalesIQ"
          className={CAMPO}
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted">¿Cuándo aplica? (según lo que llegue en el POST)</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            name="campo"
            required
            value={campo}
            onChange={(e) => setCampo(e.target.value)}
            placeholder="Campo (ej. origen, etiquetas)"
            className={CAMPO}
          />
          <select name="operador" value={operador} onChange={(e) => setOperador(e.target.value)} className={CAMPO}>
            <option value="igual">es igual a</option>
            <option value="contiene">contiene</option>
            <option value="existe">viene con algún valor</option>
          </select>
          <input
            name="valor"
            required={operador !== "existe"}
            disabled={operador === "existe"}
            value={operador === "existe" ? "" : valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={operador === "existe" ? "(no hace falta)" : "Valor (ej. zoho-salesiq)"}
            className={CAMPO}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Guion (prompt) que usará la IA — reemplaza el que mande la plataforma externa
        </label>
        <textarea
          name="promptPersonalizado"
          required
          rows={7}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Escribe aquí el guion completo de la llamada."
          className={`${CAMPO} font-mono text-xs leading-relaxed`}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-dashed border-edge p-3">
        <p className="text-xs font-medium text-muted">¿Cuándo se hace la llamada?</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
          {(
            [
              ["ahora", "De inmediato"],
              ["espera", "Esperar un tiempo"],
              ["hora", "Todos los días a una hora (corte)"],
              ["fecha", "Una sola vez, en una fecha concreta"],
            ] as const
          ).map(([valorCuando, etiqueta]) => (
            <label key={valorCuando} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="cuando"
                value={valorCuando}
                checked={cuando === valorCuando}
                onChange={() => setCuando(valorCuando)}
              />
              {etiqueta}
            </label>
          ))}
        </div>

        {cuando === "hora" && (
          <>
            <div className="flex items-center gap-2">
              <input
                name="hora_del_dia"
                type="time"
                required
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className={`${CAMPO} w-fit`}
              />
              <input type="hidden" name="zona_horaria" value={zona} />
              <span className="text-xs text-muted">{zona ? `(hora de ${zona})` : ""}</span>
            </div>
            <p className="text-xs text-muted">
              Se repite todos los días, sin fecha fija. Las solicitudes que coincidan con esta regla se guardan y se
              llaman a la hora de corte: las que lleguen antes salen hoy a esa hora y las que lleguen después salen
              mañana. Así, a las 12:00 sale todo lo acumulado desde el corte anterior. Crea otra regla para otra hora
              de corte (ej. 15:40).
            </p>
          </>
        )}
        {cuando === "espera" && (
          <div className="flex items-center gap-2">
            <input
              name="espera_cantidad"
              type="number"
              min={1}
              max={129600}
              required
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={`${CAMPO} w-24`}
            />
            <select name="espera_unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)} className={`${CAMPO} w-auto`}>
              <option value="minutos">minutos</option>
              <option value="horas">horas</option>
              <option value="dias">días</option>
            </select>
            <span className="text-xs text-muted">después de recibir la solicitud</span>
          </div>
        )}
        {cuando === "fecha" && (
          <>
            <input
              type="datetime-local"
              value={fechaLocal}
              onChange={(e) => setFechaLocal(e.target.value)}
              required
              className={`${CAMPO} w-fit`}
            />
            <input type="hidden" name="fecha_iso" value={fechaIso} />
            <p className="text-xs text-muted">
              Si esa hora ya pasó cuando llegue una solicitud, se llama de inmediato. Si la plataforma manda su propia
              hora en el POST, esa manda sobre la de la regla.
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <ShieldAlert size={12} /> {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={guardando}
          className="ts-brand-button flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {guardando && <Loader2 size={13} className="animate-spin" />}
          {guardando ? "Guardando…" : regla ? "Guardar cambios" : "Crear regla"}
        </button>
        <button type="button" onClick={onCancelar} className="text-sm text-muted hover:text-ink-2">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Interruptor activar / desactivar una regla. Cambia al instante y vuelve atrás si falla. */
function InterruptorRegla({ id, activa }: { id: string; activa: boolean }) {
  const [on, setOn] = useState(activa);
  const [error, setError] = useState("");
  const [guardando, iniciar] = useTransition();

  // Si el dato del servidor cambia (se refrescó la página), el interruptor lo sigue.
  useEffect(() => {
    setOn(activa);
  }, [activa]);

  function alternar() {
    const anterior = on;
    const nuevo = !on;
    setOn(nuevo);
    setError("");
    iniciar(async () => {
      const r = await alternarReglaAction(id, nuevo);
      if (r.error) {
        setOn(anterior);
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={on ? "Desactivar regla" : "Activar regla"}
        onClick={alternar}
        className="flex items-center gap-2"
      >
        <span
          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
            on ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
          } ${guardando ? "opacity-60" : ""}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              on ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </span>
        <span className={`w-14 text-left text-xs font-medium ${on ? "text-emerald-700 dark:text-emerald-400" : "text-muted"}`}>
          {on ? "Activa" : "Inactiva"}
        </span>
      </button>
      {error && <span className="max-w-[16rem] text-right text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

function TarjetaRegla({ regla }: { regla: ReglaApiLlamadas }) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);

  return (
    <div className={`rounded-lg border p-4 ${regla.activa ? "border-edge" : "border-edge bg-surface-2/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={abierto || editando}
        >
          {abierto || editando ? (
            <ChevronDown size={15} className="mt-0.5 flex-shrink-0 text-muted" />
          ) : (
            <ChevronRight size={15} className="mt-0.5 flex-shrink-0 text-muted" />
          )}
          <span className="min-w-0">
            <span className={`block text-sm font-semibold ${regla.activa ? "text-ink" : "text-muted"}`}>
              {regla.nombre}
            </span>
            <span className="block text-xs text-muted">
              Si <span className="font-mono">{regla.campo}</span> {ETIQUETAS_OPERADOR[regla.operador] ?? regla.operador}
              {regla.operador !== "existe" && <> &quot;{regla.valor}&quot;</>}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted" suppressHydrationWarning>
              <Clock size={11} /> {describirHorario(regla)}
            </span>
          </span>
        </button>
        <InterruptorRegla id={regla.id} activa={regla.activa} />
      </div>

      {editando ? (
        <div className="mt-4 border-t border-edge pt-4">
          <FormularioRegla regla={regla} onListo={() => setEditando(false)} onCancelar={() => setEditando(false)} />
        </div>
      ) : (
        abierto && (
          <div className="mt-3 border-t border-edge pt-3">
            <p className="mb-1 text-xs font-medium text-muted">Guion (prompt)</p>
            <pre className="whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
              {regla.prompt_personalizado}
            </pre>
            <div className="mt-3 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:underline"
              >
                <Pencil size={12} /> Editar regla y prompt
              </button>
              <BotonAccion
                accion={eliminarReglaAction.bind(null, regla.id)}
                mensajeExito="Eliminada."
                mensajeConfirmar={`¿Eliminar la regla "${regla.nombre}"?`}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-red-600"
              >
                <Trash2 size={12} /> Eliminar
              </BotonAccion>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/**
 * Simulador: pega el JSON que mandaría tu plataforma y dice qué regla se
 * aplicaría — sin hacer ninguna llamada. Sirve para comprobar que una regla
 * de verdad coincide (nombre del campo, mayúsculas, listas de etiquetas…).
 */
function ProbadorReglas() {
  const [texto, setTexto] = useState(
    '{\n  "numero": "+18095551234",\n  "origen": "mi-crm",\n  "etiquetas": ["vip"]\n}'
  );
  const [resultado, setResultado] = useState<ResultadoPruebaRegla | null>(null);
  const [error, setError] = useState("");
  const [probando, iniciar] = useTransition();

  function probar() {
    setError("");
    setResultado(null);
    iniciar(async () => {
      const r = await probarReglasAction(texto);
      if (r.error) setError(r.error);
      else setResultado(r.resultado ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-edge p-4">
      <div className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
        <FlaskConical size={14} className="text-indigo-600" /> Probar qué regla se aplicaría
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        spellCheck={false}
        className={`${CAMPO} font-mono text-xs`}
        aria-label="JSON de ejemplo"
      />
      <button
        type="button"
        onClick={probar}
        disabled={probando}
        className="w-fit rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60"
      >
        {probando ? "Probando…" : "Probar"}
      </button>
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <ShieldAlert size={12} /> {error}
        </p>
      )}
      {resultado && (
        <div className="flex flex-col gap-1 text-xs">
          <p className={resultado.aplicada ? "flex items-center gap-1 font-medium text-emerald-700" : "text-muted"}>
            {resultado.aplicada ? (
              <>
                <CheckCircle2 size={13} /> Se aplicaría la regla &quot;{resultado.aplicada.nombre}&quot;.
              </>
            ) : (
              "Ninguna regla activa coincide: se usaría el prompt que mande la plataforma, o el normal de la empresa."
            )}
          </p>
          <ul className="list-disc pl-4 text-muted">
            {resultado.evaluadas.map((r) => (
              <li key={r.id}>
                {r.nombre}: {r.coincide ? "coincide" : "no coincide"}
                {!r.activa && " (inactiva, no se usa)"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
