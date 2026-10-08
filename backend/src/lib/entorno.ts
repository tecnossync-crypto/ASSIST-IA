/**
 * Entorno en el que corre este backend: "prod" (por defecto) o "qa".
 *
 * En QA se prueban los cambios antes de pasarlos a producción, sobre una base de
 * datos, claves y número de Twilio propios. La regla de oro de QA es que NUNCA
 * debe llamar a un cliente real por accidente: ver verificarDestinoPermitido().
 */
export const ENTORNO = (process.env.ENTORNO ?? "prod").trim().toLowerCase();

/** Versión desplegada (hash corto del commit); la pone deploy/deploy.sh. */
export const VERSION = process.env.APP_VERSION || "dev";

export function esQA(): boolean {
  return ENTORNO === "qa";
}

function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Teléfonos a los que QA SÍ puede llamar (QA_NUMEROS_PERMITIDOS, separados por coma). */
function numerosPermitidosQA(): string[] {
  return (process.env.QA_NUMEROS_PERMITIDOS ?? "")
    .split(",")
    .map((n) => soloDigitos(n.trim()))
    .filter((n) => n.length >= 7);
}

/**
 * Candado de QA: solo se puede originar una llamada hacia
 * - "client:..." (el navegador de un asesor, no es un teléfono real), o
 * - un número que esté en QA_NUMEROS_PERMITIDOS (compara los últimos 10 dígitos).
 * Todo lo demás (clientes reales, la central SIP de producción) se bloquea con
 * un error claro. Si la lista está vacía, no se puede llamar a ningún teléfono.
 * En producción no hace nada.
 */
export function verificarDestinoPermitido(destino: unknown): void {
  if (!esQA()) return;

  const to = String(destino ?? "").trim();
  if (to.startsWith("client:")) return;
  if (to.startsWith("sip:")) {
    throw new Error(`[QA] Llamada bloqueada: QA no marca por la central/SIP (${to}).`);
  }

  const fin = soloDigitos(to).slice(-10);
  if (fin.length >= 7 && numerosPermitidosQA().some((n) => n.slice(-10) === fin)) return;

  throw new Error(
    `[QA] Llamada bloqueada: ${to || "(sin número)"} no está en QA_NUMEROS_PERMITIDOS. ` +
      "En QA solo se llama a números autorizados."
  );
}
