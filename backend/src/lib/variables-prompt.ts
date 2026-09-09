import { pool } from "../db/pool.js";
import { normalizarNumero } from "./telefono.js";

interface CampoPersonalizado {
  nombre: string;
  api_name?: string;
}

export interface ContactoConocido {
  nombre: string | null;
  apellido: string | null;
  datos: Record<string, string>;
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
 * Busca el contacto ya conocido para este número (si existe) y sustituye
 * {{nombre}}, {{apellido}}, {{numero}} y {{api_name}} de cada campo
 * personalizado en el guion por sus datos reales. También devuelve el
 * contacto tal cual, para que el system prompt del bot (ver
 * voice-server/src/llm.ts) le diga explícitamente qué ya sabe de este
 * cliente — así funciona aunque la empresa NO haya usado {{variables}} en
 * su guion. Si no hay contacto o no hay numeroCliente, se devuelve el
 * guion tal cual (con las llaves {{...}} sin tocar) y contacto = null.
 */
export async function aplicarVariablesContacto(
  guionAgente: Record<string, unknown>,
  camposPersonalizados: CampoPersonalizado[],
  empresaId: string,
  numeroCliente: string | null | undefined
): Promise<{ guion: Record<string, unknown>; contacto: ContactoConocido | null }> {
  if (!numeroCliente) return { guion: guionAgente, contacto: null };

  // BUG que hacía que esto casi nunca encontrara al contacto: comparaba el
  // número tal cual llegaba (de Twilio, o como se haya escrito a mano)
  // contra lo guardado en `contactos.numero` SIN normalizar ninguno de los
  // dos lados — bastaba una diferencia de formato (espacios, guiones, con/
  // sin +1) para que la búsqueda fallara en silencio.
  const numeroNormalizado = normalizarNumero(numeroCliente);

  const contacto = await pool.query<{
    nombre: string | null;
    apellido: string | null;
    datos: Record<string, string>;
  }>("SELECT nombre, apellido, datos FROM contactos WHERE empresa_id = $1 AND numero = $2", [
    empresaId,
    numeroNormalizado,
  ]);
  const c = contacto.rows[0];
  if (!c) return { guion: guionAgente, contacto: null };

  const variables: Record<string, string> = {
    nombre: c.nombre ?? "",
    apellido: c.apellido ?? "",
    numero: numeroNormalizado,
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

  return {
    guion: resultado,
    contacto: { nombre: c.nombre, apellido: c.apellido, datos: c.datos ?? {} },
  };
}
