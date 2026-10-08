"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Plus, Trash2, ShieldAlert, ChevronDown, ChevronRight, Power, FlaskConical, CheckCircle2 } from "lucide-react";
import type { ReglaApiLlamadas, ResultadoPruebaRegla } from "@/lib/api";
import {
  crearReglaAction,
  probarReglasAction,
  alternarReglaAction,
  eliminarReglaAction,
  type EstadoRegla,
} from "@/app/(app)/configuracion/integraciones/actions";
import { BotonAccion } from "@/components/BotonAccion";

const ESTADO_INICIAL: EstadoRegla = {};
const CAMPO =
  "rounded-md border border-edge bg-surface px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const ETIQUETAS_OPERADOR: Record<string, string> = {
  igual: "es igual a",
  contiene: "contiene",
  existe: "viene con algún valor",
};

export function ReglasApiLlamadas({ reglas }: { reglas: ReglaApiLlamadas[] }) {
  const [estado, formAction, cargando] = useActionState(crearReglaAction, ESTADO_INICIAL);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [operador, setOperador] = useState("igual");
  const [cuando, setCuando] = useState<"ahora" | "espera" | "hora" | "fecha">("ahora");
  // Zona horaria de quien configura la regla (la "hora del día" se entiende en ella).
  const [zona, setZona] = useState("");
  useEffect(() => {
    setZona(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  }, []);
  // El input datetime-local no trae zona horaria; se convierte aquí, en el
  // navegador de quien configura, a ISO con su zona — así la hora que elige
  // es la que se respeta, no la del servidor.
  const [fechaLocal, setFechaLocal] = useState("");
  const fechaIso = fechaLocal && !Number.isNaN(new Date(fechaLocal).getTime()) ? new Date(fechaLocal).toISOString() : "";

  // Al crear la regla con éxito se cierra el formulario (antes se quedaba
  // abierto y vacío, sin ninguna señal de que se hubiera creado).
  useEffect(() => {
    if (estado.ok) setMostrarForm(false);
  }, [estado]);

  return (
    <div className="flex flex-col gap-3">
      {reglas.length === 0 && !mostrarForm && (
        <p className="text-sm text-muted">
          Sin reglas todavía — se usa el &quot;prompt&quot; que mande la plataforma externa tal cual, si mandó uno.
        </p>
      )}

      {reglas.length > 0 && (
        <div className="flex flex-col divide-y divide-edge rounded-md border border-edge">
          {reglas.map((r) => (
            <FilaRegla key={r.id} regla={r} />
          ))}
        </div>
      )}

      {mostrarForm ? (
        <form action={formAction} className="flex flex-col gap-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
          <input name="nombre" required placeholder="Nombre de la regla (ej. Zoho SalesIQ)" className={CAMPO} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input name="campo" required placeholder="Campo del POST (ej. origen, etiquetas)" className={CAMPO} />
            <select name="operador" value={operador} onChange={(e) => setOperador(e.target.value)} className={CAMPO}>
              <option value="igual">es igual a</option>
              <option value="contiene">contiene</option>
              <option value="existe">viene con algún valor</option>
            </select>
            <input
              name="valor"
              required={operador !== "existe"}
              disabled={operador === "existe"}
              placeholder={operador === "existe" ? "(no hace falta)" : "Valor (ej. zoho-salesiq)"}
              className={`${CAMPO} disabled:opacity-50`}
            />
          </div>
          <textarea
            name="promptPersonalizado"
            required
            rows={4}
            placeholder="Guion completo a usar cuando esta regla aplique — reemplaza el prompt que mande la plataforma externa."
            className={`${CAMPO} font-mono`}
          />
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-edge p-3">
            <p className="text-xs font-medium text-ink-2">¿Cuándo se hace la llamada cuando esta regla aplique?</p>
            <div className="flex flex-wrap gap-4 text-xs text-ink-2">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="cuando" value="ahora" checked={cuando === "ahora"} onChange={() => setCuando("ahora")} />
                De inmediato
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="cuando" value="espera" checked={cuando === "espera"} onChange={() => setCuando("espera")} />
                Esperar un tiempo
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="cuando" value="hora" checked={cuando === "hora"} onChange={() => setCuando("hora")} />
                A una hora del día
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="cuando" value="fecha" checked={cuando === "fecha"} onChange={() => setCuando("fecha")} />
                Fecha y hora fija
              </label>
            </div>
            {cuando === "hora" && (
              <>
                <div className="flex items-center gap-2">
                  <input name="hora_del_dia" type="time" required defaultValue="12:00" className={`${CAMPO} w-fit`} />
                  <input type="hidden" name="zona_horaria" value={zona} />
                  <span className="text-xs text-muted">{zona ? `(hora de ${zona})` : ""}</span>
                </div>
                <p className="text-xs text-muted">
                  Las solicitudes que coincidan con esta regla se guardan y se llaman la próxima vez que sea esa
                  hora: si llegan antes, salen hoy a esa hora; si llegan después, mañana. Así, a las 12:00 sale todo
                  lo que se acumuló desde el día anterior. Crea otra regla para otra hora (ej. 15:40).
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
                  defaultValue={30}
                  required
                  className={`${CAMPO} w-24`}
                />
                <select name="espera_unidad" defaultValue="minutos" className={CAMPO}>
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
                  Si esa hora ya pasó cuando llegue una solicitud, se llama de inmediato. Si la plataforma manda su
                  propia hora en el POST, esa manda sobre la de la regla.
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={cargando}
              className="ts-brand-button rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {cargando ? "Creando…" : "Crear regla"}
            </button>
            <button type="button" onClick={() => setMostrarForm(false)} className="text-xs text-muted hover:text-ink-2">
              Cancelar
            </button>
          </div>
          {estado.error && (
            <p className="flex items-center gap-1 text-xs text-red-600">
              <ShieldAlert size={12} /> {estado.error}
            </p>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setMostrarForm(true)}
          className="flex w-fit items-center gap-1.5 text-sm text-indigo-700 hover:underline"
        >
          <Plus size={14} /> Nueva regla
        </button>
      )}

      {reglas.length > 0 && <ProbadorReglas />}
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
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-dashed border-edge p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
        <FlaskConical size={14} className="text-indigo-600" /> Probar qué regla se aplicaría
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        spellCheck={false}
        className={`${CAMPO} font-mono`}
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

function describirHorario(r: ReglaApiLlamadas): string {
  if (r.hora_del_dia) return `llama a las ${r.hora_del_dia}`;
  if (r.fecha_programada) {
    return `llama el ${new Date(r.fecha_programada).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}`;
  }
  const m = r.retraso_minutos ?? 0;
  if (m <= 0) return "";
  if (m % 1440 === 0) return `llama a los ${m / 1440} día(s)`;
  if (m % 60 === 0) return `llama a las ${m / 60} hora(s)`;
  return `llama a los ${m} min`;
}

function FilaRegla({ regla }: { regla: ReglaApiLlamadas }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left text-sm"
        >
          {abierto ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
          <span className={`font-medium ${regla.activa ? "text-ink" : "text-muted line-through"}`}>{regla.nombre}</span>
          <span className="text-xs text-muted">
            {regla.campo} {ETIQUETAS_OPERADOR[regla.operador] ?? regla.operador}
            {regla.operador !== "existe" && <> &quot;{regla.valor}&quot;</>}
            {describirHorario(regla) && <> · {describirHorario(regla)}</>}
          </span>
        </button>
        <div className="flex items-center gap-3">
          <BotonAccion
            accion={alternarReglaAction.bind(null, regla.id, !regla.activa)}
            mensajeExito={regla.activa ? "Desactivada." : "Activada."}
            className={`flex items-center gap-1 text-xs ${regla.activa ? "text-emerald-700" : "text-muted"} hover:underline`}
          >
            <Power size={11} />
            {regla.activa ? "Activa" : "Inactiva"}
          </BotonAccion>
          <BotonAccion
            accion={eliminarReglaAction.bind(null, regla.id)}
            mensajeExito="Eliminada."
            mensajeConfirmar={`¿Eliminar la regla "${regla.nombre}"?`}
            className="text-muted hover:text-red-600"
          >
            <Trash2 size={13} />
          </BotonAccion>
        </div>
      </div>
      {abierto && (
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-xs text-ink-2">
          {regla.prompt_personalizado}
        </pre>
      )}
    </div>
  );
}
