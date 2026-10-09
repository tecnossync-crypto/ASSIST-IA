"use client";

import { useState } from "react";
import { Music, FileAudio, MessageSquareText, MessagesSquare, VolumeX } from "lucide-react";
import { FormConFeedback } from "@/components/FormConFeedback";
import { guardarEsperaClienteAction } from "@/app/(app)/configuracion/enrutamiento/actions";
import type { EsperaCliente, TipoEspera } from "@/lib/api";

const OPCIONES: { valor: TipoEspera; titulo: string; detalle: string; Icon: typeof Music }[] = [
  { valor: "musica", titulo: "Música estándar", detalle: "La canción de siempre.", Icon: Music },
  { valor: "audio", titulo: "Audio propio", detalle: "Tu música o un anuncio grabado.", Icon: FileAudio },
  { valor: "mensaje", titulo: "Mensaje hablado", detalle: "Una voz lee tu texto en repetición.", Icon: MessageSquareText },
  {
    valor: "mensaje_musica",
    titulo: "Mensaje y música",
    detalle: "Lee tu texto (ej. tus productos) y luego suena la música; se repite.",
    Icon: MessagesSquare,
  },
  { valor: "silencio", titulo: "Silencio", detalle: "El cliente no oye nada.", Icon: VolumeX },
];

const CAMPO =
  "w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function EsperaClienteForm({ espera }: { espera: EsperaCliente }) {
  const [tipo, setTipo] = useState<TipoEspera>(espera.tipo);
  const [audioUrl, setAudioUrl] = useState(espera.audioUrl ?? "");
  const [mensaje, setMensaje] = useState(espera.mensaje ?? "");

  return (
    <FormConFeedback action={guardarEsperaClienteAction} mensajeExito="Espera del cliente guardada.">
      <input type="hidden" name="tipo" value={tipo} />
      {/* Lo escrito en un tipo se conserva al cambiar a otro y volver. */}
      {tipo !== "audio" && tipo !== "mensaje_musica" && <input type="hidden" name="audioUrl" value={audioUrl} />}
      {tipo !== "mensaje" && tipo !== "mensaje_musica" && <input type="hidden" name="mensaje" value={mensaje} />}

      <div role="radiogroup" aria-label="Qué oye el cliente mientras espera" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPCIONES.map(({ valor, titulo, detalle, Icon }) => {
          const activa = tipo === valor;
          return (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => setTipo(valor)}
              className={
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors " +
                (activa
                  ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 dark:bg-indigo-500/10"
                  : "border-edge hover:bg-surface-2")
              }
            >
              <span
                className={
                  "mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md " +
                  (activa ? "bg-indigo-600 text-white" : "bg-surface-2 text-muted")
                }
              >
                <Icon size={15} />
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">{titulo}</span>
                <span className="block text-xs text-muted">{detalle}</span>
              </span>
            </button>
          );
        })}
      </div>

      {(tipo === "audio" || tipo === "mensaje_musica") && (
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-muted">
            {tipo === "audio" ? "Enlace del audio (mp3 o wav)" : "Música (opcional) — enlace mp3 o wav; vacío = la estándar"}
          </label>
          <input
            name="audioUrl"
            type="url"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://tu-sitio.com/musica-de-espera.mp3"
            className={CAMPO}
          />
          <p className="mt-1 text-xs text-muted">
            Debe ser un enlace <strong>https público</strong> (que se abra sin iniciar sesión). Se repite mientras el
            cliente espera.
          </p>
          {/^https:\/\//i.test(audioUrl) && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls src={audioUrl} className="mt-2 h-9 w-full" preload="none" />
          )}
        </div>
      )}

      {(tipo === "mensaje" || tipo === "mensaje_musica") && (
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-muted">Mensaje que se lee mientras espera</label>
          <textarea
            name="mensaje"
            maxLength={1500}
            rows={6}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Gracias por esperar. Mientras tanto, le presentamos nuestros productos: Seguro de ley, Ley más extensión, Seguros de vida, salud y de viaje…"
            className={CAMPO}
          />
          <p className="mt-1 text-xs text-muted">
            {mensaje.length}/1500 caracteres.{" "}
            {tipo === "mensaje_musica"
              ? "Se lee el mensaje, suena la música una vez y se repite hasta que lo atiendan. La voz y la música no suenan a la vez."
              : "Se lee, hace una pausa corta y se repite hasta que lo atiendan."}
          </p>
        </div>
      )}

      <div className="mt-4 border-t border-edge pt-4">
        <label className="mb-1 block text-xs font-medium text-muted">
          Aviso al transferir (opcional) — se dice una sola vez antes de la espera
        </label>
        <input
          name="aviso"
          maxLength={300}
          defaultValue={espera.aviso ?? ""}
          placeholder="Un momento por favor, lo comunicamos con un asesor."
          className={CAMPO}
        />
        <p className="mt-1 text-xs text-muted">
          Si lo dejas vacío, todo sigue como hasta ahora (al esperar en la cola se usa el aviso de “todos nuestros
          asesores están ocupados”).
        </p>
      </div>
    </FormConFeedback>
  );
}
