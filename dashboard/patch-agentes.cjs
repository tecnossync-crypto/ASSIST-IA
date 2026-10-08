const fs = require("fs");
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
function parchar(file, pares) {
  let s = fs.readFileSync(file, "utf8");
  const crlf = s.includes(CR + LF);
  for (let [a, b] of pares) {
    if (crlf) { a = a.split(LF).join(CR + LF); b = b.split(LF).join(CR + LF); }
    if (!s.includes(a)) throw new Error(file + ": no encontrado: " + a.slice(0, 80));
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(file, s);
}

parchar("app/(app)/configuracion/agentes/actions.ts", [
  [`  const pin = String(formData.get("pin") ?? "").trim();\n`, ""],
  [
    `  // Admin y supervisor siempre necesitan entrar al dashboard completo; para
  // un agente (operador) es opcional que además tenga acceso al dashboard.
  const conAcceso = rol !== "operador" || formData.get("conAcceso") === "on";

  if (!nombre || !email) return { error: "Nombre y email son requeridos." };
  if (!conAcceso && !pin) {
    return { error: "Un agente necesita un PIN (softphone) o acceso al dashboard." };
  }
  if (conAcceso && modoPassword === "manual" && passwordManual.length < 8) {`,
    `  // Todos los usuarios (agentes incluidos) entran con su email y contraseña:
  // el teléfono del panel se usa con esa misma cuenta, ya no hay un PIN aparte.
  if (!nombre || !email) return { error: "Nombre y email son requeridos." };
  if (modoPassword === "manual" && passwordManual.length < 8) {`,
  ],
  [
    `  const passwordGenerada = conAcceso
    ? modoPassword === "manual"
      ? passwordManual
      : generarPasswordTemporal()
    : undefined;`,
    `  const passwordGenerada = modoPassword === "manual" ? passwordManual : generarPasswordTemporal();`,
  ],
  [`      pin: pin || undefined,\n`, ""],
]);

parchar("components/NuevoAgenteForm.tsx", [
  [
    `  const requiereAcceso = rol !== "operador";\n\n`,
    "",
  ],
  [
    `            Agente: entra al softphone con PIN. Supervisor: ve todo excepto Configuración (incluye Supervisión en
            vivo). Administrador: acceso total.`,
    `            Todos entran con su email y contraseña y reciben llamadas desde el panel de teléfono. Agente: atiende
            llamadas. Supervisor: ve todo excepto Configuración (incluye Supervisión en vivo). Administrador: acceso
            total.`,
  ],
  [
    `          <input
            name="pin"
            inputMode="numeric"
            pattern="\d{4,6}"
            title="4 a 6 dígitos"
            placeholder={rol === "operador" ? "PIN softphone (4-6 dígitos)" : "PIN softphone (opcional)"}
            className={CAMPO}
          />

          {requiereAcceso ? (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <KeyRound size={12} />
              Este rol siempre tiene acceso al dashboard completo.
            </p>
          ) : (
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input type="checkbox" name="conAcceso" className="rounded border-edge" />
              También darle acceso al dashboard completo (además del PIN)
            </label>
          )}

`,
    "",
  ],
]);

parchar("app/(app)/configuracion/agentes/page.tsx", [
  [
    `                    {" · "}
                    {a.pin ? \`PIN \${a.pin}\` : "sin PIN"} ·{" "}
                    {a.tiene_acceso_dashboard ? "acceso dashboard" : "sin acceso dashboard"} ·{" "}`,
    `                    {" · "}
                    {a.tiene_acceso_dashboard ? "con acceso" : "sin contraseña (no puede entrar)"} ·{" "}`,
  ],
  [
    `              {a.tiene_acceso_dashboard && (
                <>
                  <CambiarPasswordAgente id={a.id} nombre={a.nombre} />
                  <Configurar2FA id={a.id} habilitado={a.totp_habilitado} />
                </>
              )}`,
    `              <CambiarPasswordAgente id={a.id} nombre={a.nombre} tieneAcceso={a.tiene_acceso_dashboard} />
              {a.tiene_acceso_dashboard && <Configurar2FA id={a.id} habilitado={a.totp_habilitado} />}`,
  ],
]);

parchar("components/CambiarPasswordAgente.tsx", [
  [
    `// que borrarlo y crearlo de nuevo. Solo aplica a usuarios con acceso al
// dashboard (password_hash) — los agentes de solo PIN no la necesitan.
export function CambiarPasswordAgente({ id, nombre }: { id: string; nombre: string }) {`,
    `// que borrarlo y crearlo de nuevo. También sirve para darle acceso a un
// usuario que todavía no tiene contraseña (ej. un agente de la época del PIN).
export function CambiarPasswordAgente({
  id,
  nombre,
  tieneAcceso = true,
}: {
  id: string;
  nombre: string;
  tieneAcceso?: boolean;
}) {`,
  ],
  [`        Cambiar contraseña\n`, `        {tieneAcceso ? "Cambiar contraseña" : "Darle acceso (crear contraseña)"}\n`],
  ["        <KeyRound size={13} />\n        {tieneAcceso", "        <KeyRound size={13} />\n        {tieneAcceso"],
]);

parchar("app/api/agentes/presencia/route.ts", [
  [
    `import { marcarPresenciaAgente, type EstadoPresencia } from "@/lib/api";`,
    `import { marcarPresenciaAgente, type EstadoPresencia } from "@/lib/api";\nimport { obtenerSesion } from "@/lib/session";`,
  ],
  [
    `export async function POST(req: Request) {
  const { usuarioId, disponible, estado } = await req.json();
`,
    `export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { usuarioId, disponible, estado } = await req.json();

  // Cada quien cambia SU estado; solo admin y supervisor pueden cambiar el de otro.
  if (usuarioId && usuarioId !== sesion.usuarioId && sesion.rol === "operador") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
`,
  ],
]);
