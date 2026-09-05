"use client";

import { useState } from "react";
import { guardarDatosContactoAction } from "@/app/(app)/contactos/[id]/actions";
import type { CampoPersonalizado } from "@/lib/api";
import { OverlayGuardando } from "./OverlayGuardando";

/**
 * Muestra los campos personalizados configurados en Configuración →
 * Contactos como inputs editables (no solo lo que el bot haya capturado en
 * una llamada) — así se pueden llenar/corregir a mano desde la ficha del
 * contacto. Si el contacto tiene datos guardados de campos que ya no están
 * configurados, se muestran aparte, de solo lectura, para no perderlos.
 */
export function EditorDatosContacto({
  contactoId,
  campos,
  valorInicial,
}: {
  contactoId: string;
  campos: CampoPersonalizado[];
  valorInicial: Record<string, string>;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const c of campos) inicial[c.nombre] = valorInicial[c.nombre] ?? "";
    return inicial;
  });
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const nombresConfigurados = new Set(campos.map((c) => c.nombre));
  const datosHuérfanos = Object.entries(valorInicial).filter(([k]) => !nombresConfigurados.has(k));

  function actualizar(nombre: string, valor: string) {
    setValores((prev) => ({ ...prev, [nombre]: valor }));
    setGuardado(false);
  }

  async function guardar() {
    setGuardando(true);
    const formData = new FormData();
    formData.set("contactoId", contactoId);
    // Se manda el set completo (campos configurados + lo que ya hubiera de
    // campos huérfanos) para no perder datos que el bot capturó de un campo
    // que luego se dejó de configurar.
    const combinado = { ...Object.fromEntries(datosHuérfanos), ...valores };
    formData.set("datos_json", JSON.stringify(combinado));
    await guardarDatosContactoAction(formData);
    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  }

  if (campos.length === 0 && datosHuérfanos.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No hay campos configurados — agrégalos en Configuración → Contactos.
      </p>
    );
  }

  return (
    <div className="relative flex flex-col gap-3">
      <OverlayGuardando estado={guardando ? "guardando" : guardado ? "ok" : null} />
      {campos.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {campos.map((campo) => {
            const tipo = campo.tipo ?? "texto";
            const valor = valores[campo.nombre] ?? "";
            return (
              <div key={campo.nombre} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">{campo.nombre}</label>
                {tipo === "dropdown" ? (
                  <select
                    value={valor}
                    onChange={(e) => actualizar(campo.nombre, e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">—</option>
                    {(campo.opciones ?? []).map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={tipo === "fecha" ? "date" : "text"}
                    value={valor}
                    onChange={(e) => actualizar(campo.nombre, e.target.value)}
                    placeholder={tipo === "texto" ? campo.descripcion || undefined : undefined}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {datosHuérfanos.length > 0 && (
        <div className="rounded-md bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-500">
            Otros datos capturados (campo ya no está configurado):
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {datosHuérfanos.map(([campo, valor]) => (
              <div key={campo}>
                <dt className="text-slate-500">{campo}</dt>
                <dd className="font-medium">{valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {campos.length > 0 && (
        <div>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="ts-brand-button w-fit rounded-md px-3 py-1.5 text-xs font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
          >
            Guardar datos
          </button>
        </div>
      )}
    </div>
  );
}
