/**
 * Normaliza un número de teléfono a un formato consistente antes de
 * guardarlo/compararlo — sin esto, "809-555-1234", "8095551234" y
 * "+18095551234" se guardan como 3 contactos distintos aunque sean la
 * misma persona, porque el UNIQUE (empresa_id, numero) compara el string
 * tal cual. Twilio siempre manda E.164 (+18095551234) en sus webhooks;
 * un contacto agregado a mano o importado por CSV puede venir en cualquier
 * formato — de ahí el contacto "duplicado" al llamarlo.
 *
 * Regla: quita todo lo que no sea dígito o "+". Si quedan exactamente 10
 * dígitos sin "+", se asume NANP (+1, República Dominicana/EE.UU./Canadá) —
 * el mercado de esta plataforma — y se le antepone "+1". Cualquier otro
 * caso (ya tiene "+", o tiene una cantidad de dígitos distinta) se deja
 * como quedó, solo limpio de separadores.
 */
export function normalizarNumero(numero: string): string {
  const limpio = numero.trim().replace(/[^\d+]/g, "");
  if (limpio.startsWith("+")) return limpio;
  if (/^\d{10}$/.test(limpio)) return `+1${limpio}`;
  return limpio ? `+${limpio}` : limpio;
}
