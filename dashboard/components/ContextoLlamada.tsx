"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, ChevronUp, ClipboardCopy, Loader2, Phone, Tag } from "lucide-react";
import type { TransferenciaContexto } from "@/lib/api";

// Si el asesor prefiere el contexto minimizado durante las llamadas, se recuerda en este navegador.
const CLAVE_MINIMIZADO = "voz-ia:contexto-minimizado";

const SATISFACCION: Record<string, { texto: string; clase: string }> = {
  positiva: { texto: "Cliente contento", clase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  neutral: { texto: "Cliente neutral", clase: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300" },
  negativa: { texto: "Cliente molesto", clase: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" },
};

function haceCuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.round(min / 60)} h`;
}

/** Datos del cliente: lo que la IA capturó en esta llamada + lo guardado en el contacto, sin repetir. */
function datosDelCliente(c: TransferenciaContexto): { campo: string; valor: string }[] {
  const lista = [...c.datos_capturados];
  const ya = new Set(lista.map((d) => d.campo.toLowerCase()));
  for (const [campo, valor] of Object.entries(c.contacto?.datos ?? {})) {
    if (typeof valor === "string" && valor.trim() && !ya.has(campo.toLowerCase())) {
      lista.push({ campo, valor });
    }
  }
  return lista;
}

function textoParaCopiar(c: TransferenciaContexto, nombre: string): string {
  const lineas = [`Cliente: ${nombre} (${c.numero})`];
  if (c.resumen.motivo) lineas.push(`Motivo: ${c.resumen.motivo}`);
  if (c.resumen.solicitud) lineas.push(`Solicitud: ${c.resumen.solicitud}`);
  if (c.resumen.accion_pendiente) lineas.push(`Pendiente: ${c.resumen.accion_pendiente}`);
  const datos = datosDelCliente(c);
  if (datos.length) lineas.push(`Datos: ${datos.map((d) => `${d.campo}: ${d.valor}`).join(", ")}`);
  return lineas.join("\n");
}

/**
 * Tarjeta de contexto de una llamada que la IA transfirió: qué quiere el
 * cliente, lo que ya dio y (opcional) la conversación, para que quien contesta
 * no tenga que volver a preguntar todo. Se muestra en la pestaña "Contexto"
 * del panel de teléfono.
 */
export function ContextoLlamada({
  item,
  visto,
  onVisto,
  onLlamar,
  compacto = false,
}: {
  item: TransferenciaContexto;
  visto: boolean;
  onVisto: () => void;
  onLlamar: (numero: string) => void;
  /** Sin botones ni conversación: para mostrarla dentro de la llamada entrante / en curso. */
  compacto?: boolean;
}) {
  const [verConversacion, setVerConversacion] = useState(false);
  const [copiado, setCopiado] = useState(false);
  // Solo aplica dentro de la llamada (compacto): deja ver los controles y atender a más de un cliente.
  const [minimizado, setMinimizado] = useState(false);
  useEffect(() => {
    if (!compacto) return;
    try {
      setMinimizado(window.localStorage.getItem(CLAVE_MINIMIZADO) === "1");
    } catch {
      // sin acceso al almacenamiento: queda expandido
    }
  }, [compacto]);

  function alternarMinimizado() {
    setMinimizado((actual) => {
      const nuevo = !actual;
      try {
        window.localStorage.setItem(CLAVE_MINIMIZADO, nuevo ? "1" : "0");
      } catch {
        // no pasa nada: solo no se recuerda
      }
      return nuevo;
    });
  }

  const nombre = [item.contacto?.nombre, item.contacto?.apellido].filter(Boolean).join(" ") || "Cliente sin nombre";
  const datos = datosDelCliente(item);
  const etiquetas = item.contacto?.etiquetas ?? [];
  const sat = item.resumen.satisfaccion ? SATISFACCION[item.resumen.satisfaccion] : null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoParaCopiar(item, nombre));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sin permiso de portapapeles: no pasa nada
    }
  }

  if (compacto && minimizado) {
    return (
      <button
        type="button"
        onClick={alternarMinimizado}
        aria-label="Mostrar el contexto de la llamada"
        className="flex w-full items-center gap-2 rounded-xl border border-edge bg-surface px-3 py-2 text-left hover:bg-surface-2"
      >
        <ChevronRight size={14} className="flex-shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{nombre}</span>
          <span className="block truncate text-xs text-muted">
            {item.resumen_listo ? (item.resumen.motivo ?? item.numero) : "Generando el resumen…"}
          </span>
        </span>
        <span className="flex-shrink-0 text-xs font-medium text-indigo-700 dark:text-indigo-300">Ver</span>
      </button>
    );
  }

  return (
    <div
      className={
        "rounded-2xl border p-3 text-left " +
        (visto ? "border-edge bg-surface" : "border-indigo-300 bg-indigo-50/50 dark:border-indigo-500/40 dark:bg-indigo-500/10")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{nombre}</p>
          <p className="text-xs text-muted">
            {item.numero} · {haceCuanto(item.resumen_en ?? item.iniciada_en)}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          {compacto && (
            <button
              type="button"
              onClick={alternarMinimizado}
              aria-label="Minimizar el contexto"
              title="Minimizar"
              className="rounded-full p-1 text-muted hover:bg-surface-2 hover:text-ink-2"
            >
              <ChevronUp size={14} />
            </button>
          )}
          {!visto && (
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Nueva
            </span>
          )}
          {item.cola_nombre && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">{item.cola_nombre}</span>
          )}
        </div>
      </div>

      {!item.resumen_listo ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <Loader2 size={13} className="animate-spin" /> Generando el resumen de la conversación…
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5 text-sm">
          {sat && <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${sat.clase}`}>{sat.texto}</span>}

          {(item.resumen.motivo || item.resumen.solicitud) && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Qué quiere</p>
              {item.resumen.motivo && <p className="text-ink">{item.resumen.motivo}</p>}
              {item.resumen.solicitud && item.resumen.solicitud !== item.resumen.motivo && (
                <p className="mt-0.5 text-ink-2">{item.resumen.solicitud}</p>
              )}
            </div>
          )}

          {item.resumen.accion_pendiente && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Pendiente</p>
              <p className="text-ink-2">{item.resumen.accion_pendiente}</p>
            </div>
          )}

          {datos.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Datos del cliente</p>
              <dl className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {datos.map((d) => (
                  <div key={d.campo} className="contents">
                    <dt className="text-muted">{d.campo}</dt>
                    <dd className="break-words text-ink">{d.valor}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {etiquetas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Tag size={12} className="text-muted" />
              {etiquetas.map((e) => (
                <span key={e} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">
                  {e}
                </span>
              ))}
            </div>
          )}

          {!compacto && item.turnos.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setVerConversacion((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300"
              >
                {verConversacion ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {verConversacion ? "Ocultar conversación" : "Ver conversación con la IA"}
              </button>
              {verConversacion && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {item.turnos.map((t, i) => (
                    <p
                      key={i}
                      className={
                        "max-w-[92%] rounded-xl px-2.5 py-1.5 text-xs " +
                        (t.hablante === "cliente"
                          ? "self-end bg-indigo-600 text-white"
                          : "self-start bg-surface-2 text-ink-2")
                      }
                    >
                      {t.texto}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!compacto && (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onLlamar(item.numero)}
          className="flex items-center gap-1 rounded-full border border-edge px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-2"
        >
          <Phone size={12} /> Llamar
        </button>
        {item.resumen_listo && (
          <button
            type="button"
            onClick={copiar}
            className="flex items-center gap-1 rounded-full border border-edge px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-2"
          >
            {copiado ? <Check size={12} className="text-emerald-600" /> : <ClipboardCopy size={12} />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
        )}
        {!visto && (
          <button type="button" onClick={onVisto} className="ml-auto text-xs text-muted hover:text-ink-2">
            Marcar como vista
          </button>
        )}
      </div>
      )}
    </div>
  );
}
