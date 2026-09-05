import { pool } from "../db/pool.js";

interface CampoPersonalizado {
  nombre: string;
  api_name?: string;
}

// Campos del guion donde tiene sentido escribir {{variables}} — el resto
// (datos_a_tomar, etc.) no son texto libre hablado, así que no se tocan.
const CAMPOS_CON_VARIABLES = [
  "prompt_personalizado",
  "saludo",
  "que_resuelve",
  "cuando_transferir",
  "instrucciones_extra",
] as const;

/**
 * Sustituye {{nombre}}, {{apellido}}, {{numero}} y {{api_name}} de cada
 * campo personalizado por los datos reales del contacto — cuando ya
 * sabemos quién es (llamada a un número que ya tenemos en Contactos). Si no
 * hay contacto o no hay numeroCliente, el guion se devuelve tal cual (con
 * las llaves {{...}} sin tocar, para no romper nada si alguien las usó a
 * propósito para otra cosa).
 */
export async function aplicarVariablesContacto(
  guionAgente: Record<string, unknown>,
  camposPersonalizados: CampoPersonalizado[],
  empresaId: string,
  numeroCliente: string | null | undefined
): Promise<Record<string, unknown>> {
  if (!numeroCliente) return guionAgente;

  const contacto = await pool.query<{
    nombre: string | null;
    apellido: string | null;
    datos: Record<string, string>;
  }>("SELECT nombre, apellido, datos FROM contactos WHERE empresa_id = $1 AND numero = $2", [
    empresaId,
    numeroCliente,
  ]);
  const c = contacto.rows[0];
  if (!c) return guionAgente;

  const variables: Record<string, string> = {
    nombre: c.nombre ?? "",
    apellido: c.apellido ?? "",
    numero: numeroCliente,
  };
  for (const campo of camposPersonalizados) {
    if (campo.api_name) variables[campo.api_name] = c.datos?.[campo.nombre] ?? "";
  }

  function sustituir(texto: string): string {
    return texto.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) =>
      key in variables ? variables[key] : match
    );
  }

  const resultado: Record<string, unknown> = { ...guionAgente };
  for (const campo of CAMPOS_CON_VARIABLES) {
    const valor = resultado[campo];
    if (typeof valor === "string" && valor.includes("{{")) {
      resultado[campo] = sustituir(valor);
    }
  }
  return resultado;
}
