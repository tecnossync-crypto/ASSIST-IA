import { pool } from "../db/pool.js";

export type OperadorRegla = "igual" | "contiene" | "existe";

interface ReglaApiLlamadas {
  id: string;
  nombre: string;
  campo: string;
  operador: OperadorRegla;
  valor: string;
  prompt_personalizado: string;
  retraso_minutos: number | null;
  fecha_programada: Date | null;
  hora_del_dia: string | null;
  zona_horaria: string | null;
}

/**
 * Próxima vez que sea `hora` (HH:MM) en la zona `zona`: hoy si todavía no
 * llega, mañana si ya pasó. Se calcula en Postgres para no depender de una
 * librería de zonas horarias.
 */
export async function proximaOcurrencia(hora: string, zona: string): Promise<Date> {
  const r = await pool.query<{ proxima: Date }>(
    `SELECT CASE
              WHEN ((now() AT TIME ZONE $2)::date + $1::time) AT TIME ZONE $2 > now()
                THEN ((now() AT TIME ZONE $2)::date + $1::time) AT TIME ZONE $2
              ELSE ((now() AT TIME ZONE $2)::date + 1 + $1::time) AT TIME ZONE $2
            END AS proxima`,
    [hora, zona]
  );
  return r.rows[0].proxima;
}

/**
 * Valores de texto que trae el body en el campo de una regla. Acepta:
 * - ruta con puntos para campos anidados: "contacto.etiqueta";
 * - texto, números y booleanos (se comparan como texto);
 * - listas (ej. "etiquetas": ["vip","moroso"]): la regla aplica si CUALQUIER
 *   elemento coincide.
 */
function valoresDelCampo(body: Record<string, unknown>, campo: string): string[] {
  let actual: unknown = body;
  for (const parte of campo.split(".")) {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return [];
    actual = (actual as Record<string, unknown>)[parte];
  }

  const aplanar = (v: unknown): string[] => {
    if (typeof v === "string") return [v];
    if (typeof v === "number" || typeof v === "boolean") return [String(v)];
    if (Array.isArray(v)) return v.flatMap(aplanar);
    return [];
  };
  return aplanar(actual);
}

export function coincideRegla(
  regla: { campo: string; operador: string; valor: string },
  body: Record<string, unknown>
): boolean {
  const recibidos = valoresDelCampo(body, regla.campo.trim()).map((v) => v.trim().toLowerCase());
  if (regla.operador === "existe") return recibidos.some((v) => v !== "");

  const esperado = regla.valor.trim().toLowerCase();
  return regla.operador === "contiene"
    ? recibidos.some((v) => v.includes(esperado))
    : recibidos.some((v) => v === esperado);
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
): Promise<{
  reglaId: string;
  nombre: string;
  promptPersonalizado: string;
  retrasoMinutos: number | null;
  fechaProgramada: Date | null;
  horaDelDia: string | null;
  zonaHoraria: string | null;
} | null> {
  const result = await pool.query<ReglaApiLlamadas>(
    `SELECT id, nombre, campo, operador, valor, prompt_personalizado, retraso_minutos, fecha_programada,
            to_char(hora_del_dia, 'HH24:MI') AS hora_del_dia, zona_horaria
     FROM reglas_api_llamadas
     WHERE empresa_id = $1 AND activa = true
     ORDER BY orden, creado_en`,
    [empresaId]
  );

  for (const regla of result.rows) {
    if (coincideRegla(regla, body)) {
      return {
        reglaId: regla.id,
        nombre: regla.nombre,
        promptPersonalizado: regla.prompt_personalizado,
        retrasoMinutos: regla.retraso_minutos,
        fechaProgramada: regla.fecha_programada,
        horaDelDia: regla.hora_del_dia,
        zonaHoraria: regla.zona_horaria,
      };
    }
  }

  return null;
}
