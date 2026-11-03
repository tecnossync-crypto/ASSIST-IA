"use client";

import { useEffect, useState } from "react";
import { Bot, Headset, Hourglass, Radio } from "lucide-react";
import type { LlamadaActiva } from "@/lib/api";
import { MonitoreoLlamada } from "./MonitoreoLlamada";
import { MonitoreoLlamadaIA } from "./MonitoreoLlamadaIA";
import { EstadoVacio, IconoDireccion, Insignia, Metrica, TarjetaTabla, TH } from "./ui";

function formatDuracionEnVivo(iniciadaEn: string): string {
  const segundos = Math.max(0, Math.floor((Date.now() - new Date(iniciadaEn).getTime()) / 1000));
  const m = String(Math.floor(segundos / 60)).padStart(2, "0");
  const s = String(segundos % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Vista en vivo de "Supervisión": todas las llamadas en curso ahora mismo,
 * con qué agente las está atendiendo — se refresca sola cada pocos segundos
 * (no hace falta que el supervisor recargue la página para ver una llamada
 * nueva que acaba de entrar, o una que ya terminó desaparecer de la lista).
 */
export function TablaSupervision({ llamadasIniciales }: { llamadasIniciales: LlamadaActiva[] }) {
  const [llamadas, setLlamadas] = useState(llamadasIniciales);
  const [, forzarRender] = useState(0);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/supervision/activas", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setLlamadas(data.llamadas ?? []);
      } catch {
        // silencioso: se reintenta en el próximo tick
      }
    }, 4000);

    const ticker = setInterval(() => forzarRender((n) => n + 1), 1000);

    return () => {
      clearInterval(poll);
      clearInterval(ticker);
    };
  }, []);

  const conAsesor = llamadas.filter((l) => l.agente_nombre).length;
  const esperando = llamadas.filter((l) => !l.agente_nombre && l.conferencia_nombre).length;
  const conBot = llamadas.length - conAsesor - esperando;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica Icon={Radio} tono="verde" etiqueta="Llamadas en vivo" valor={llamadas.length} />
        <Metrica Icon={Bot} tono="azul" etiqueta="Con el bot" valor={conBot} />
        <Metrica Icon={Headset} tono="violeta" etiqueta="Con un asesor" valor={conAsesor} />
        <Metrica Icon={Hourglass} tono="ambar" etiqueta="Esperando asesor" valor={esperando} />
      </div>

      <TarjetaTabla>
        {llamadas.length === 0 ? (
          <EstadoVacio
            Icon={Radio}
            titulo="No hay llamadas activas en este momento"
            descripcion="Cuando entre o salga una llamada la verás aquí al instante, con quién la atiende."
          />
        ) : (
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className={TH}>Dirección</th>
                <th className={TH}>Cliente</th>
                <th className={TH}>Cola</th>
                <th className={TH}>Atiende</th>
                <th className={TH}>Duración</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {llamadas.map((l) => (
                <tr key={l.id} className="transition-colors hover:bg-surface-2">
                  <td className="whitespace-nowrap px-4 py-3">
                    <IconoDireccion direccion={l.direccion} titulo />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-ink">
                    {l.direccion === "entrante" ? l.numero_origen : l.numero_destino}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-2">{l.cola_nombre ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {l.agente_nombre ? (
                      <Insignia tono="verde" pulso>
                        {l.agente_nombre}
                      </Insignia>
                    ) : l.conferencia_nombre ? (
                      <Insignia tono="ambar" pulso>
                        Esperando que contesten
                      </Insignia>
                    ) : (
                      <Insignia tono="azul" pulso>
                        Con el bot
                      </Insignia>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] tabular-nums text-ink-2">
                    {formatDuracionEnVivo(l.iniciada_en)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {l.agente_call_sid ? (
                      <MonitoreoLlamada llamadaId={l.id} />
                    ) : !l.conferencia_nombre ? (
                      <MonitoreoLlamadaIA callSid={l.call_sid} />
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TarjetaTabla>
    </div>
  );
}
