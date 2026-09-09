/**
 * Parser CSV simple y seguro (sin librerías externas — el paquete xlsx de
 * npm tiene vulnerabilidades sin parche, así que evitamos parsear .xlsx
 * binario). Excel exporta/abre CSV nativamente, así que cubre el caso real.
 * Detecta columnas por nombre de encabezado: numero/telefono/phone,
 * nombre/name, apellido/lastname. Sin encabezado reconocible, asume que la
 * primera columna es el número y la segunda el nombre.
 *
 * Cualquier OTRA columna cuyo encabezado coincida (sin importar mayúsculas)
 * con el nombre de un campo personalizado configurado (ej. "Vigencia",
 * "Aseguradora") se guarda en `datos` — así, si ya se conoce esa
 * información al importar, el bot no la vuelve a preguntar en la llamada
 * (ver contacto_conocido en voice-server/src/llm.ts). Antes esas columnas
 * se ignoraban por completo, aunque el CSV las trajera.
 */
export function parseCSV(
  texto: string,
  camposPersonalizados: { nombre: string }[] = []
): { numero: string; nombre?: string; apellido?: string; datos?: Record<string, string> }[] {
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

  // Columnas restantes que coinciden con un campo personalizado configurado.
  const columnasCampos = tieneEncabezado
    ? camposPersonalizados
        .map((campo) => ({ campo: campo.nombre, idx: primera.findIndex((c) => c === campo.nombre.toLowerCase()) }))
        .filter((c) => c.idx !== -1)
    : [];

  const resultado: { numero: string; nombre?: string; apellido?: string; datos?: Record<string, string> }[] = [];
  for (const linea of filas) {
    const cols = parseLinea(linea);
    const numero = cols[colNumero]?.trim();
    if (!numero) continue;
    const nombre = colNombre >= 0 ? cols[colNombre]?.trim() : undefined;
    const apellido = colApellido >= 0 ? cols[colApellido]?.trim() : undefined;

    const datos: Record<string, string> = {};
    for (const { campo, idx } of columnasCampos) {
      const valor = cols[idx]?.trim();
      if (valor) datos[campo] = valor;
    }

    resultado.push({
      numero,
      nombre: nombre || undefined,
      apellido: apellido || undefined,
      datos: Object.keys(datos).length > 0 ? datos : undefined,
    });
  }
  return resultado;
}
