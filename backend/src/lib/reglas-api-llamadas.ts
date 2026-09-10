import { pool } from "../db/pool.js";

interface ReglaApiLlamadas {
  id: string;
  campo: string;
  operador: "igual" | "contiene";
  valor: string;
  prompt_personalizado: string;
}

/**
 * Evalúa las reglas activas de la empresa (Configuración → Integraciones →
 * Reglas del API) contra el body de una solicitud a /api/webhooks/llamadas
 * — en orden, la primera que matchea gana. Si ninguna matchea, devuelve
 * null (el llamador cae al comportamiento normal: usar el "prompt" que
 * mandó la plataforma externa, si mandó uno).
 *
 * Esto existe porque confiar ciegamente en el texto libre que manda la
 * plataforma externa como "prompt" es frágil: algunas integraciones (ej.
 * Zoho SalesIQ) mandan una nota corta de contexto, no un guion de verdad,
 * y esa nota terminaba reemplazando TODO el prompt del bot. Con una regla,
 * la empresa controla el guion real que se usa; el campo que llegó solo
 * decide CUÁL regla aplica.
 */
export async function evaluarReglaApiLlamadas(
  empresaId: string,
  body: Record<string, unknown>
): Promise<{ reglaId: string; promptPersonalizado: string } | null> {
  const result = await pool.query<ReglaApiLlamadas>(
    `SELECT id, campo, operador, valor, prompt_personalizado
     FROM reglas_api_llamadas
     WHERE empresa_id = $1 AND activa = true
     ORDER BY orden, creado_en`,
    [empresaId]
  );

  for (const regla of result.rows) {
    const valorRecibido = body[regla.campo];
    if (typeof valorRecibido !== "string") continue;

    const coincide =
      regla.operador === "contiene"
        ? valorRecibido.toLowerCase().includes(regla.valor.toLowerCase())
        : valorRecibido.trim().toLowerCase() === regla.valor.trim().toLowerCase();

    if (coincide) {
      return { reglaId: regla.id, promptPersonalizado: regla.prompt_personalizado };
    }
  }

  return null;
}
