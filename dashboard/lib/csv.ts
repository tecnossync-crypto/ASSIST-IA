/**
 * Parser CSV simple y seguro (sin librerías externas — el paquete xlsx de
 * npm tiene vulnerabilidades sin parche, así que evitamos parsear .xlsx
 * binario). Excel exporta/abre CSV nativamente, así que cubre el caso real.
 * Detecta columnas por nombre de encabezado: numero/telefono/phone,
 * nombre/name, apellido/lastname. Sin encabezado reconocible, asume que la
 * primera columna es el número y la segunda el nombre.
 */
export function parseCSV(texto: string): { numero: string; nombre?: string; apellido?: string }[] {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length === 0) return [];

  const parseLinea = (linea: string) => linea.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));

  const primera = parseLinea(lineas[0]).map((c) => c.toLowerCase());
  const idxNumero = primera.findIndex((c) => ["numero", "número", "telefono", "teléfono", "phone"].includes(c));
  const idxNombre = primera.findIndex((c) => ["nombre", "name"].includes(c));
  const idxApellido = primera.findIndex((c) => ["apellido", "lastname", "last name"].includes(c));

  const tieneEncabezado = idxNumero !== -1;
  const filas = tieneEncabezado ? lineas.slice(1) : lineas;
  const colNumero = tieneEncabezado ? idxNumero : 0;
  const colNombre = tieneEncabezado ? idxNombre : 1;
  const colApellido = tieneEncabezado ? idxApellido : -1;

  const resultado: { numero: string; nombre?: string; apellido?: string }[] = [];
  for (const linea of filas) {
    const cols = parseLinea(linea);
    const numero = cols[colNumero]?.trim();
    const nombre = colNombre >= 0 ? cols[colNombre]?.trim() : undefined;
    const apellido = colApellido >= 0 ? cols[colApellido]?.trim() : undefined;
    if (numero) resultado.push({ numero, nombre: nombre || undefined, apellido: apellido || undefined });
  }
  return resultado;
}
