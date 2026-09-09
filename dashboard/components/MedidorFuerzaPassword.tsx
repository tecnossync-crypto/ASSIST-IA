"use client";

// Checklist de formato + barra de fuerza en vivo, para cuando un admin
// escribe una contraseña a mano en vez de generarla automáticamente.
const REGLAS = [
  { etiqueta: "Al menos 8 caracteres", test: (p: string) => p.length >= 8 },
  { etiqueta: "Una mayúscula y una minúscula", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { etiqueta: "Al menos un número", test: (p: string) => /\d/.test(p) },
  { etiqueta: "Un símbolo (opcional, suma fuerza)", test: (p: string) => /[^a-zA-Z0-9]/.test(p), opcional: true },
];

const COLORES = ["bg-red-400", "bg-amber-400", "bg-amber-400", "bg-emerald-500", "bg-emerald-500"];
const ETIQUETAS = ["Muy débil", "Débil", "Regular", "Buena", "Fuerte"];

export function MedidorFuerzaPassword({ password }: { password: string }) {
  const cumplidas = REGLAS.filter((r) => r.test(password)).length;
  const nivel = password.length === 0 ? 0 : cumplidas;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < nivel ? COLORES[nivel] : "bg-surface-2"}`}
          />
        ))}
      </div>
      {password.length > 0 && <p className="text-[11px] text-muted">{ETIQUETAS[nivel]}</p>}
      <ul className="flex flex-col gap-0.5">
        {REGLAS.map((r) => {
          const ok = r.test(password);
          return (
            <li
              key={r.etiqueta}
              className={`text-[11px] ${ok ? "text-emerald-600" : r.opcional ? "text-muted" : "text-muted"}`}
            >
              {ok ? "✓" : "·"} {r.etiqueta}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
