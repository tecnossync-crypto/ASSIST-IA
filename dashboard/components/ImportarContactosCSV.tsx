"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { parseCSV } from "@/lib/csv";

export function ImportarContactosCSV({ onImportar }: { onImportar: (texto: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mensaje, setMensaje] = useState("");

  async function manejarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    try {
      const texto = await archivo.text();
      const contactos = parseCSV(texto);
      if (contactos.length === 0) {
        setMensaje("No se encontraron números en el archivo.");
        return;
      }
      const lineasParaTextarea = contactos
        .map((c) => (c.nombre ? `${c.numero}, ${c.nombre}` : c.numero))
        .join("\n");
      onImportar(lineasParaTextarea);
      setMensaje(`${contactos.length} contacto(s) importados desde ${archivo.name}.`);
    } catch {
      setMensaje("No se pudo leer el archivo. Verifica que sea un CSV válido.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-fit items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
      >
        <Upload size={14} />
        Importar desde CSV
      </button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={manejarArchivo} className="hidden" />
      {mensaje && <p className="text-xs text-slate-500">{mensaje}</p>}
      <p className="text-xs text-slate-400">
        Columnas <code>numero</code> y <code>nombre</code> (o sin encabezado: número en la primera columna, nombre en
        la segunda). En Excel: Archivo → Guardar como → CSV.
      </p>
    </div>
  );
}
