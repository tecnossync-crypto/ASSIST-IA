"use client";

import { useMemo, useRef, useState } from "react";
import { Braces } from "lucide-react";
import type { CampoPersonalizado } from "@/lib/api";

interface Variable {
  api_name: string;
  label: string;
}

const VARIABLES_FIJAS: Variable[] = [
  { api_name: "nombre", label: "Nombre del contacto" },
  { api_name: "apellido", label: "Apellido del contacto" },
  { api_name: "numero", label: "Teléfono del contacto" },
];

/**
 * Igual que la consola de prompt de antes, pero escribiendo "/" aparece un
 * menú con las variables disponibles ({{nombre}}, {{numero_de_poliza}}...)
 * — al elegir una se inserta en el cursor. Esas variables se sustituyen por
 * los datos reales del contacto al momento de la llamada, si ya lo
 * conocemos (ver backend/src/lib/variables-prompt.ts).
 */
export function EditorPromptConVariables({
  defaultValue,
  campos,
  placeholder,
}: {
  defaultValue?: string;
  campos: CampoPersonalizado[];
  placeholder?: string;
}) {
  const [valor, setValor] = useState(defaultValue ?? "");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [indiceActivo, setIndiceActivo] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const posicionSlashRef = useRef<number | null>(null);

  const variables = useMemo<Variable[]>(
    () => [
      ...VARIABLES_FIJAS,
      ...campos.filter((c) => c.api_name).map((c) => ({ api_name: c.api_name as string, label: c.nombre })),
    ],
    [campos]
  );

  const variablesFiltradas = variables.filter(
    (v) => v.api_name.includes(filtro.toLowerCase()) || v.label.toLowerCase().includes(filtro.toLowerCase())
  );

  function manejarCambio(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const texto = e.target.value;
    const cursor = e.target.selectionStart;
    setValor(texto);

    // Busca el "/" más cercano hacia atrás desde el cursor, en la misma
    // "palabra" (sin espacios de por medio) — así sabemos si seguimos
    // escribiendo el filtro de variables o ya se cerró.
    const textoAntes = texto.slice(0, cursor);
    const match = textoAntes.match(/\/([a-zA-Z0-9_]*)$/);
    if (match) {
      posicionSlashRef.current = cursor - match[0].length;
      setFiltro(match[1]);
      setMenuAbierto(true);
      setIndiceActivo(0);
    } else {
      setMenuAbierto(false);
    }
  }

  function insertarVariable(v: Variable) {
    const inicio = posicionSlashRef.current;
    if (inicio == null || !textareaRef.current) return;

    const cursor = textareaRef.current.selectionStart;
    const nuevoTexto = valor.slice(0, inicio) + `{{${v.api_name}}} ` + valor.slice(cursor);
    setValor(nuevoTexto);
    setMenuAbierto(false);

    requestAnimationFrame(() => {
      const nuevaPos = inicio + v.api_name.length + 5; // {{ + nombre + }} + espacio
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nuevaPos, nuevaPos);
    });
  }

  function manejarTeclado(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!menuAbierto || variablesFiltradas.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceActivo((i) => (i + 1) % variablesFiltradas.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceActivo((i) => (i - 1 + variablesFiltradas.length) % variablesFiltradas.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertarVariable(variablesFiltradas[indiceActivo]);
    } else if (e.key === "Escape") {
      setMenuAbierto(false);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id="prompt_personalizado"
        name="prompt_personalizado"
        value={valor}
        onChange={manejarCambio}
        onKeyDown={manejarTeclado}
        onBlur={() => setTimeout(() => setMenuAbierto(false), 150)}
        placeholder={placeholder}
        spellCheck={false}
        className="h-[420px] w-full resize-none bg-slate-950 px-4 py-4 font-mono text-sm text-slate-100 caret-indigo-400 placeholder:text-slate-600 focus:outline-none lg:h-[520px]"
      />

      {menuAbierto && variablesFiltradas.length > 0 && (
        <div className="absolute bottom-3 left-4 z-20 w-64 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
          <div className="flex items-center gap-1.5 border-b border-slate-700 px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-400">
            <Braces size={11} />
            Variables del contacto
          </div>
          <div className="max-h-56 overflow-y-auto">
            {variablesFiltradas.map((v, i) => (
              <button
                key={v.api_name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertarVariable(v);
                }}
                className={
                  "flex w-full flex-col items-start px-3 py-1.5 text-left " +
                  (i === indiceActivo ? "bg-indigo-600/30" : "hover:bg-slate-700/60")
                }
              >
                <span className="font-mono text-xs text-indigo-300">{`{{${v.api_name}}}`}</span>
                <span className="text-[11px] text-slate-400">{v.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
