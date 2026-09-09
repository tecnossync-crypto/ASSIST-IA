"use client";

import { useActionState, useState } from "react";
import { KeyRound, Copy, Check, ShieldAlert, User, Mail, Phone, Wand2, Pencil, ImagePlus } from "lucide-react";
import { crearAgenteAction, type EstadoCrearAgente } from "@/app/(app)/configuracion/agentes/actions";
import { MedidorFuerzaPassword } from "@/components/MedidorFuerzaPassword";
import type { Cola } from "@/lib/api";

const ESTADO_INICIAL: EstadoCrearAgente = {};
const CAMPO =
  "w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function Seccion({ titulo, Icon, children }: { titulo: string; Icon: typeof User; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon size={13} />
        {titulo}
      </div>
      {children}
    </div>
  );
}

export function NuevoAgenteForm({ colas }: { colas: Cola[] }) {
  const [estado, formAction, cargando] = useActionState(crearAgenteAction, ESTADO_INICIAL);
  const [rol, setRol] = useState("operador");
  const [modoPassword, setModoPassword] = useState<"auto" | "manual">("auto");
  const [passwordManual, setPasswordManual] = useState("");
  const [copiado, setCopiado] = useState(false);

  const requiereAcceso = rol !== "operador";

  async function copiarPassword() {
    if (!estado.passwordGenerada) return;
    try {
      await navigator.clipboard.writeText(estado.passwordGenerada);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // portapapeles no disponible — el usuario puede seleccionar el texto a mano
    }
  }

  if (estado.passwordGenerada) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-medium">
          {estado.nombreCreado} fue creado. Copia esta contraseña ahora — no se volverá a mostrar.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-emerald-300 bg-surface px-3 py-2 font-mono text-sm">
            {estado.emailCreado} · {estado.passwordGenerada}
          </code>
          <button
            type="button"
            onClick={copiarPassword}
            className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-surface px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          >
            {copiado ? <Check size={13} /> : <Copy size={13} />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-emerald-800">
          <ImagePlus size={12} />
          Ya puedes agregarle foto de perfil y activar 2FA desde la lista de abajo.
        </p>
        <a href="/configuracion/agentes" className="self-start text-xs font-medium text-emerald-800 hover:underline">
          Agregar otro usuario
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {estado.error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <ShieldAlert size={15} />
          {estado.error}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-6 rounded-xl border border-edge bg-surface p-5">
        <Seccion titulo="Información básica" Icon={User}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input name="nombre" required placeholder="Nombre completo" className={CAMPO} />
            <div className="relative">
              <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input name="email" type="email" required placeholder="Email" className={`${CAMPO} pl-8`} />
            </div>
            <div className="relative">
              <Phone size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input name="telefono" type="tel" placeholder="Teléfono (opcional)" className={`${CAMPO} pl-8`} />
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Rol y cola" Icon={KeyRound}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select name="rol" value={rol} onChange={(e) => setRol(e.target.value)} className={CAMPO}>
              <option value="operador">Agente</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Administrador</option>
            </select>
            <select name="colaId" defaultValue="" className={CAMPO}>
              <option value="">Sin cola</option>
              {colas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted">
            Agente: entra al softphone con PIN. Supervisor: ve todo excepto Configuración (incluye Supervisión en
            vivo). Administrador: acceso total.
          </p>
        </Seccion>

        <Seccion titulo="Acceso" Icon={KeyRound}>
          <input
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

          <div className="flex flex-col gap-2 rounded-lg border border-edge bg-surface-2/50 p-3">
            <p className="text-xs font-medium text-ink-2">Contraseña de acceso al dashboard</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModoPassword("auto")}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
                  (modoPassword === "auto"
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                    : "border-edge text-muted hover:bg-surface")
                }
              >
                <Wand2 size={13} />
                Generar automática
              </button>
              <button
                type="button"
                onClick={() => setModoPassword("manual")}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
                  (modoPassword === "manual"
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                    : "border-edge text-muted hover:bg-surface")
                }
              >
                <Pencil size={13} />
                Escribir una
              </button>
            </div>
            <input type="hidden" name="modoPassword" value={modoPassword} />

            {modoPassword === "auto" ? (
              <p className="text-[11px] text-muted">
                Te la muestro una sola vez apenas se cree el usuario, lista para copiar.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  name="passwordManual"
                  type="password"
                  value={passwordManual}
                  onChange={(e) => setPasswordManual(e.target.value)}
                  placeholder="Contraseña"
                  className={CAMPO}
                />
                <MedidorFuerzaPassword password={passwordManual} />
              </div>
            )}
          </div>
        </Seccion>

        <button
          type="submit"
          disabled={cargando}
          className="ts-brand-button self-start rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
        >
          {cargando ? "Creando..." : "Agregar usuario"}
        </button>
      </form>
    </div>
  );
}
