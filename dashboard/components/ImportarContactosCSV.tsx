"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

/**
 * Parser CSV simple y seguro (sin librerías externas — el paquete xlsx de
 * npm tiene vulnerabilidades sin parche, así que evitamos parsear .xlsx
 * binario). Excel exporta/abre CSV nativamente, así que cubre el caso real.
 * Detecta columnas por nombre de encabezado: numero/telefono/phone y
 * nombre/name. Si no hay encabezados reconocibles, asume que la primera
 * columna es el número y la segunda el nombre.
 */
function parseCSV(texto: string): { numero: string; nombre?: string }[] {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length === 0) return [];

  const parseLinea = (linea: string) => linea.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));

  const primera = parseLinea(lineas[0]).map((c) => c.toLowerCase());
  const idxNumero = primera.findIndex((c) => ["numero", "número", "telefono", "teléfono", "phone"].includes(c));
  const idxNombre = primera.findIndex((c) => ["nombre", "name"].includes(c));

  const tieneEncabezado = idxNumero !== -1;
  const filas = tieneEncabezado ? lineas.slice(1) : lineas;
  const colNumero = tieneEncabezado ? idxNumero : 0;
  const colNombre = tieneEncabezado ? idxNombre : 1;

  const resultado: { numero: string; nombre?: string }[] = [];
  for (const linea of filas) {
    const cols = parseLinea(linea);
    const numero = cols[colNumero]?.trim();
    const nombre = colNombre >= 0 ? cols[colNombre]?.trim() : undefined;
    if (numero) resultado.push({ numero, nombre: nombre || undefined });
  }
  return resultado;
}

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
