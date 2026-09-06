"use client";

import { useState } from "react";
import { Plus, Trash2, ListPlus, ChevronDown, ChevronRight, X, Type, Calendar, List } from "lucide-react";
import { generarApiName, sanearApiName, type CampoPersonalizado, type TipoCampoPersonalizado } from "@/lib/api";

const TIPOS: { valor: TipoCampoPersonalizado; label: string; Icon: typeof Type }[] = [
  { valor: "texto", label: "Texto", Icon: Type },
  { valor: "fecha", label: "Fecha", Icon: Calendar },
  { valor: "dropdown", label: "Lista (elegir una opción)", Icon: List },
];

const ETIQUETA_TIPO: Record<string, string> = { texto: "Texto", fecha: "Fecha", dropdown: "Lista" };

/**
 * Editor tipo tabla para los campos que la empresa quiere que el bot
 * recolecte. Cada campo tiene un tipo (texto libre, fecha, o una lista de
 * opciones fijas) que luego determina qué input se muestra al llenarlo a
 * mano en la ficha de contacto. Serializa a un input hidden con JSON.
 *
 * Cada fila se puede colapsar a una línea (nombre + tipo) — con muchos
 * campos configurados, verlos todos expandidos de una vez se hace larguísimo
 * de navegar. Los campos ya nombrados arrancan colapsados; uno recién
 * agregado (todavía sin nombre) arranca abierto para llenarlo de una.
 */
export function EditorCamposPersonalizados({ valorInicial }: { valorInicial: CampoPersonalizado[] }) {
  const [campos, setCampos] = useState<CampoPersonalizado[]>(
    valorInicial.length > 0 ? valorInicial : []
  );
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [importarAbierto, setImportarAbierto] = useState(false);
  const [textoImportar, setTextoImportar] = useState("");
  const [opcionNueva, setOpcionNueva] = useState<Record<number, string>>({});

  function estaExpandido(i: number, c: CampoPersonalizado): boolean {
    return expandidos.has(i) || !c.nombre.trim();
  }

  function alternarExpandido(i: number) {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(i)) siguiente.delete(i);
      else siguiente.add(i);
      return siguiente;
    });
  }

  function agregar() {
    setCampos([...campos, { nombre: "", descripcion: "", tipo: "texto" }]);
  }

  // Acepta nombres separados por coma, uno por línea, o una mezcla de ambos
  // — así no hay que darle "Agregar campo" uno por uno para una lista larga.
  function importarVarios() {
    const nombres = textoImportar
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (nombres.length === 0) return;

    const existentes = new Set(campos.map((c) => c.nombre.trim().toLowerCase()));
    const nuevos: CampoPersonalizado[] = [];
    for (const nombre of nombres) {
      if (existentes.has(nombre.toLowerCase())) continue; // no duplicar si ya existe
      existentes.add(nombre.toLowerCase());
      nuevos.push({ nombre, descripcion: "", tipo: "texto", api_name: generarApiName(nombre) });
    }

    setCampos([...campos, ...nuevos]);
    setTextoImportar("");
    setImportarAbierto(false);
  }

  function quitar(i: number) {
    setCampos(campos.filter((_, idx) => idx !== i));
  }

  function actualizar(i: number, campo: Partial<CampoPersonalizado>) {
    setCampos(
      campos.map((c, idx) => {
        if (idx !== i) return c;
        const actualizado = { ...c, ...campo };
        // Autogenera el api_name a partir del nombre mientras no se haya
        // escrito uno a mano — así siempre queda una clave técnica lista
        // para integraciones (Zoho, etc.) sin que el usuario tenga que
        // pensar en eso.
        if ("nombre" in campo && !c.api_name) {
          actualizado.api_name = generarApiName(actualizado.nombre);
        }
        return actualizado;
      })
    );
  }

  function agregarOpcion(i: number) {
    const valor = (opcionNueva[i] ?? "").trim();
    if (!valor) return;
    const campo = campos[i];
    if ((campo.opciones ?? []).includes(valor)) {
      setOpcionNueva((prev) => ({ ...prev, [i]: "" }));
      return;
    }
    actualizar(i, { opciones: [...(campo.opciones ?? []), valor] });
    setOpcionNueva((prev) => ({ ...prev, [i]: "" }));
  }

  function quitarOpcion(i: number, opcion: string) {
    actualizar(i, { opciones: (campos[i].opciones ?? []).filter((o) => o !== opcion) });
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="campos_personalizados_json" value={JSON.stringify(campos)} />

      {campos.length > 0 && (
        <div className="flex flex-col divide-y divide-edge rounded-md border border-edge">
          {campos.map((c, i) => {
            const tipo = c.tipo ?? "texto";
            const TipoIcon = TIPOS.find((t) => t.valor === tipo)?.Icon ?? Type;
            const abierto = estaExpandido(i, c);

            return (
              <div key={i} className="flex flex-col">
                {/* Fila compacta: siempre visible */}
                <button
                  type="button"
                  onClick={() => alternarExpandido(i)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-2"
                >
                  {abierto ? (
                    <ChevronDown size={14} className="flex-shrink-0 text-muted" />
                  ) : (
                    <ChevronRight size={14} className="flex-shrink-0 text-muted" />
                  )}
                  <TipoIcon size={14} className="flex-shrink-0 text-indigo-500" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {c.nombre.trim() || <span className="italic text-muted">Sin nombre todavía</span>}
                  </span>
                  <span className="flex-shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                    {ETIQUETA_TIPO[tipo] ?? tipo}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      quitar(i);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), quitar(i))}
                    className="flex-shrink-0 rounded-md p-1 text-muted hover:bg-surface hover:text-red-600"
                    aria-label="Quitar campo"
                  >
                    <Trash2 size={14} />
                  </span>
                </button>

                {/* Detalle: solo cuando está abierto */}
                {abierto && (
                  <div className="flex flex-col gap-2 border-t border-edge bg-surface-2/40 px-3 py-3">
                    <div className="flex gap-2">
                      <input
                        value={c.nombre}
                        onChange={(e) => actualizar(i, { nombre: e.target.value })}
                        placeholder="Nombre del campo (ej: número de póliza)"
                        className="flex-1 rounded-md border border-edge bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <select
                        value={tipo}
                        onChange={(e) => actualizar(i, { tipo: e.target.value as TipoCampoPersonalizado })}
                        className="rounded-md border border-edge bg-surface px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {TIPOS.map((t) => (
                          <option key={t.valor} value={t.valor}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      value={c.descripcion ?? ""}
                      onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                      placeholder="Descripción / cómo pedirlo (opcional)"
                      className="rounded-md border border-edge bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">api_name:</span>
                      <input
                        value={c.api_name ?? ""}
                        onChange={(e) => actualizar(i, { api_name: sanearApiName(e.target.value) })}
                        onBlur={(e) => actualizar(i, { api_name: e.target.value.replace(/^_+|_+$/g, "") })}
                        placeholder={generarApiName(c.nombre) || "se genera solo"}
                        className="flex-1 rounded-md border border-edge bg-surface px-2.5 py-1 font-mono text-xs text-ink-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    {tipo === "dropdown" && (
                      <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-edge p-2.5">
                        <p className="text-xs font-medium text-ink-2">Opciones de la lista</p>
                        {(c.opciones ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {(c.opciones ?? []).map((op) => (
                              <span
                                key={op}
                                className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                              >
                                {op}
                                <button
                                  type="button"
                                  onClick={() => quitarOpcion(i, op)}
                                  className="text-indigo-400 hover:text-indigo-700"
                                  aria-label={`Quitar opción ${op}`}
                                >
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            value={opcionNueva[i] ?? ""}
                            onChange={(e) => setOpcionNueva((prev) => ({ ...prev, [i]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                agregarOpcion(i);
                              }
                            }}
                            placeholder="Escribe una opción y Enter (ej: Auto)"
                            className="flex-1 rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => agregarOpcion(i)}
                            className="rounded-md border border-edge px-2.5 text-xs text-ink-2 hover:bg-surface"
                          >
                            Agregar
                          </button>
                        </div>
                        <p className="text-xs text-muted">
                          El agente y quien llene el contacto a mano elegirán una de estas opciones.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={agregar}
          className="flex w-fit items-center gap-1.5 rounded-md border border-dashed border-edge px-3 py-1.5 text-sm text-ink-2 hover:border-indigo-400 hover:text-indigo-700"
        >
          <Plus size={14} />
          Agregar campo
        </button>
        <button
          type="button"
          onClick={() => setImportarAbierto((v) => !v)}
          className="flex w-fit items-center gap-1.5 rounded-md border border-dashed border-edge px-3 py-1.5 text-sm text-ink-2 hover:border-indigo-400 hover:text-indigo-700"
        >
          <ListPlus size={14} />
          Importar varios de una vez
        </button>
      </div>

      {importarAbierto && (
        <div className="flex flex-col gap-2 rounded-md border border-edge bg-surface-2 p-3">
          <label className="text-xs font-medium text-ink-2">
            Un nombre por línea, o separados por coma — como te sea más cómodo
          </label>
          <textarea
            value={textoImportar}
            onChange={(e) => setTextoImportar(e.target.value)}
            rows={4}
            placeholder={"Número de póliza\nFecha de vencimiento\nTipo de seguro"}
            className="rounded-md border border-edge px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setImportarAbierto(false)}
              className="rounded-md border border-edge px-3 py-1.5 text-xs text-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={importarVarios}
              disabled={!textoImportar.trim()}
              className="ts-brand-button rounded-md px-3 py-1.5 text-xs font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
            >
              Agregar todos
            </button>
          </div>
          <p className="text-xs text-muted">
            Cada uno queda con tipo "Texto" y su api_name generado solo — puedes ajustar cada uno después.
          </p>
        </div>
      )}

      <p className="text-xs text-muted">
        El agente pedirá estos datos durante la llamada y quedarán guardados en el perfil de cada contacto. El
        "api_name" es la clave técnica y estable que usan las integraciones (Zoho, etc.) para mapear este campo —
        no cambia aunque edites el nombre visible.
      </p>
    </div>
  );
}
