"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Lock, Plus, ShieldCheck, Trash2, Users, XCircle } from "lucide-react";
import type { Rol } from "@/lib/api";
import {
  ALCANCES_CONTACTOS,
  ALCANCES_LLAMADAS,
  GRUPOS_PERMISOS,
  type Permisos,
} from "@/lib/permisos";
import { crearRolAction, eliminarRolAction, guardarRolAction } from "@/app/(app)/configuracion/roles/actions";

const CAMPO =
  "w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60";

const PERMISOS_VACIOS: Permisos = {
  llamadas: "ninguna",
  contactos: "ninguno",
  resumen: false,
  contactos_editar: false,
  contactos_eliminar: false,
  campanas: false,
  supervision: false,
  intervenir: false,
  configuracion: false,
  registros_api: false,
  roles: false,
};

function Interruptor({
  activo,
  onChange,
  deshabilitado,
  etiqueta,
}: {
  activo: boolean;
  onChange: (v: boolean) => void;
  deshabilitado?: boolean;
  etiqueta: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onChange(!activo)}
      className={
        "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50 " +
        (activo ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600")
      }
    >
      <span
        className={
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform " +
          (activo ? "translate-x-[22px]" : "translate-x-0.5")
        }
      />
    </button>
  );
}

function Alcance<T extends string>({
  valor,
  opciones,
  onChange,
  deshabilitado,
}: {
  valor: T;
  opciones: { valor: T; etiqueta: string; detalle: string }[];
  onChange: (v: T) => void;
  deshabilitado?: boolean;
}) {
  const actual = opciones.find((o) => o.valor === valor);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-edge bg-surface-2 p-1 sm:grid-cols-4">
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            disabled={deshabilitado}
            onClick={() => onChange(o.valor)}
            className={
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed " +
              (o.valor === valor
                ? "bg-surface text-indigo-700 shadow-sm ring-1 ring-indigo-200 dark:text-indigo-300 dark:ring-indigo-500/40"
                : "text-muted hover:text-ink")
            }
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
      {actual && <p className="text-xs text-muted">{actual.detalle}</p>}
    </div>
  );
}

export function RolesPermisos({ roles }: { roles: Rol[] }) {
  const router = useRouter();
  const [seleccionId, setSeleccionId] = useState<string>(roles[0]?.id ?? "");
  const [creando, setCreando] = useState(false);
  const seleccionado = roles.find((r) => r.id === seleccionId) ?? roles[0];

  // Borrador de lo que se está editando; se reinicia al cambiar de rol o tras guardar.
  const [borrador, setBorrador] = useState<{ id: string; nombre: string; descripcion: string; permisos: Permisos } | null>(null);
  const edicion =
    borrador && borrador.id === seleccionado?.id
      ? borrador
      : seleccionado
        ? { id: seleccionado.id, nombre: seleccionado.nombre, descripcion: seleccionado.descripcion ?? "", permisos: seleccionado.permisos }
        : null;
  const hayCambios =
    !!seleccionado &&
    !!borrador &&
    borrador.id === seleccionado.id &&
    (borrador.nombre !== seleccionado.nombre ||
      borrador.descripcion !== (seleccionado.descripcion ?? "") ||
      JSON.stringify(borrador.permisos) !== JSON.stringify(seleccionado.permisos));

  const [resultado, setResultado] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [guardando, startGuardar] = useTransition();
  const [eliminando, startEliminar] = useTransition();

  const esAdmin = seleccionado?.clave === "admin";

  function cambiar(parcial: Partial<Permisos>) {
    if (!edicion || esAdmin) return;
    const permisos = { ...edicion.permisos, ...parcial };
    // Coherencia: sin ver contactos no hay edición/eliminación; sin supervisión no se interviene.
    if (permisos.contactos === "ninguno") {
      permisos.contactos_editar = false;
      permisos.contactos_eliminar = false;
    }
    if (!permisos.supervision) permisos.intervenir = false;
    setBorrador({ ...edicion, permisos });
    setResultado(null);
  }

  function guardar() {
    if (!edicion || !seleccionado) return;
    setResultado(null);
    startGuardar(async () => {
      const r = await guardarRolAction(seleccionado.id, {
        nombre: seleccionado.sistema ? undefined : edicion.nombre,
        descripcion: edicion.descripcion,
        permisos: edicion.permisos,
      });
      setResultado(r);
      if (r.ok) {
        setBorrador(null);
        router.refresh();
        setTimeout(() => setResultado(null), 3000);
      }
    });
  }

  function eliminar() {
    if (!seleccionado || seleccionado.sistema) return;
    if (!window.confirm(`¿Eliminar el rol "${seleccionado.nombre}"? Esto no se puede deshacer.`)) return;
    startEliminar(async () => {
      const r = await eliminarRolAction(seleccionado.id);
      setResultado(r);
      if (r.ok) {
        setSeleccionId(roles.find((x) => x.id !== seleccionado.id)?.id ?? "");
        setBorrador(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[17rem_1fr]">
      {/* Lista de roles */}
      <aside className="flex flex-col gap-2">
        {roles.map((r) => {
          const activo = r.id === seleccionado?.id && !creando;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setCreando(false);
                setSeleccionId(r.id);
                setBorrador(null);
                setResultado(null);
              }}
              className={
                "flex flex-col gap-1 rounded-xl border p-3.5 text-left transition-all " +
                (activo
                  ? "border-indigo-400 bg-indigo-50/60 shadow-sm dark:border-indigo-500/60 dark:bg-indigo-500/10"
                  : "border-edge bg-surface hover:border-indigo-300")
              }
            >
              <span className="flex items-center gap-2">
                <span
                  className={
                    "flex h-7 w-7 items-center justify-center rounded-lg text-white " +
                    (r.clave === "admin"
                      ? "bg-gradient-to-br from-amber-500 to-orange-600"
                      : "bg-gradient-to-br from-indigo-500 to-violet-600")
                  }
                >
                  {r.clave === "admin" ? <Lock size={13} /> : <ShieldCheck size={14} />}
                </span>
                <span className="flex-1 truncate text-sm font-semibold text-ink">{r.nombre}</span>
                {r.sistema && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Sistema
                  </span>
                )}
              </span>
              <span className="line-clamp-2 text-xs text-muted">{r.descripcion || "Sin descripción."}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                <Users size={11} /> {r.usuarios} {r.usuarios === 1 ? "usuario" : "usuarios"}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setCreando(true);
            setResultado(null);
          }}
          className={
            "flex items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-3 text-sm font-medium transition-colors " +
            (creando
              ? "border-indigo-400 bg-indigo-50/60 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
              : "border-edge text-muted hover:border-indigo-300 hover:text-indigo-700")
          }
        >
          <Plus size={15} /> Nuevo rol
        </button>
      </aside>

      {/* Editor */}
      <section className="min-w-0">
        {creando ? (
          <NuevoRol
            roles={roles}
            onCreado={() => {
              setCreando(false);
              router.refresh();
            }}
            onCancelar={() => setCreando(false)}
          />
        ) : edicion && seleccionado ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-edge bg-surface p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
                  Nombre del rol
                  <input
                    value={edicion.nombre}
                    disabled={seleccionado.sistema}
                    onChange={(e) => {
                      setBorrador({ ...edicion, nombre: e.target.value });
                      setResultado(null);
                    }}
                    className={CAMPO}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
                  Descripción
                  <input
                    value={edicion.descripcion}
                    disabled={esAdmin}
                    maxLength={200}
                    onChange={(e) => {
                      setBorrador({ ...edicion, descripcion: e.target.value });
                      setResultado(null);
                    }}
                    placeholder="Para qué sirve este rol"
                    className={CAMPO}
                  />
                </label>
              </div>
              {esAdmin && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  <Lock size={13} className="mt-0.5 flex-shrink-0" />
                  El Administrador siempre tiene acceso total. No se puede recortar, para que la empresa nunca se quede
                  sin nadie que pueda configurarla.
                </p>
              )}
            </div>

            {GRUPOS_PERMISOS.map((g) => (
              <div key={g.titulo} className="rounded-xl border border-edge bg-surface p-5">
                <h3 className="text-sm font-semibold text-ink">{g.titulo}</h3>
                <p className="mb-4 text-xs text-muted">{g.descripcion}</p>

                {g.alcance === "llamadas" && (
                  <Alcance
                    valor={edicion.permisos.llamadas}
                    opciones={ALCANCES_LLAMADAS}
                    deshabilitado={esAdmin}
                    onChange={(v) => cambiar({ llamadas: v })}
                  />
                )}
                {g.alcance === "contactos" && (
                  <div className={g.items.length ? "mb-4" : ""}>
                    <Alcance
                      valor={edicion.permisos.contactos}
                      opciones={ALCANCES_CONTACTOS}
                      deshabilitado={esAdmin}
                      onChange={(v) => cambiar({ contactos: v })}
                    />
                  </div>
                )}

                {g.items.length > 0 && (
                  <ul className="divide-y divide-edge">
                    {g.items.map((it) => {
                      const dependeDeContactos =
                        (it.clave === "contactos_editar" || it.clave === "contactos_eliminar") &&
                        edicion.permisos.contactos === "ninguno";
                      const dependeDeSupervision = it.clave === "intervenir" && !edicion.permisos.supervision;
                      const bloqueado = esAdmin || dependeDeContactos || dependeDeSupervision;
                      return (
                        <li key={it.clave} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">{it.etiqueta}</p>
                            <p className="text-xs text-muted">
                              {dependeDeContactos
                                ? "Primero elige qué contactos puede ver."
                                : dependeDeSupervision
                                  ? "Primero activa Supervisión en vivo."
                                  : it.detalle}
                            </p>
                          </div>
                          <Interruptor
                            etiqueta={it.etiqueta}
                            activo={edicion.permisos[it.clave]}
                            deshabilitado={bloqueado}
                            onChange={(v) => cambiar({ [it.clave]: v } as Partial<Permisos>)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}

            {/* Barra de acciones */}
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge bg-surface/95 p-3 shadow-lg backdrop-blur">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
                {resultado?.ok ? (
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 size={14} /> Guardado. Cada usuario lo recibe la próxima vez que inicie sesión.
                  </span>
                ) : resultado?.error ? (
                  <span className="flex items-center gap-1.5 text-red-600">
                    <XCircle size={14} /> {resultado.error}
                  </span>
                ) : hayCambios ? (
                  <span className="text-amber-700 dark:text-amber-300">Tienes cambios sin guardar.</span>
                ) : (
                  <span>Los cambios se aplican a cada usuario la próxima vez que inicie sesión.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!seleccionado.sistema && (
                  <button
                    type="button"
                    onClick={eliminar}
                    disabled={eliminando}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                  >
                    {eliminando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Eliminar
                  </button>
                )}
                {!esAdmin && (
                  <button
                    type="button"
                    onClick={guardar}
                    disabled={guardando || !hayCambios}
                    className="ts-brand-button flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {guardando && <Loader2 size={14} className="animate-spin" />}
                    Guardar cambios
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-edge p-8 text-center text-sm text-muted">
            Elige un rol de la lista para ver y editar sus permisos.
          </p>
        )}
      </section>
    </div>
  );
}

function NuevoRol({
  roles,
  onCreado,
  onCancelar,
}: {
  roles: Rol[];
  onCreado: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [baseId, setBaseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creando, startCrear] = useTransition();

  const base = useMemo(() => roles.find((r) => r.id === baseId), [roles, baseId]);

  function crear() {
    setError(null);
    startCrear(async () => {
      const r = await crearRolAction({ nombre, descripcion, permisos: base ? { ...base.permisos } : PERMISOS_VACIOS });
      if (r.error) setError(r.error);
      else onCreado();
    });
  }

  return (
    <div className="rounded-xl border border-edge bg-surface p-5">
      <h3 className="text-sm font-semibold text-ink">Nuevo rol</h3>
      <p className="mb-4 text-xs text-muted">
        Ponle un nombre y, si quieres, parte de uno existente para no empezar de cero. Después ajustas sus permisos.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Nombre del rol
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Ej. Vendedor senior" className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Partir de
          <select value={baseId} onChange={(e) => setBaseId(e.target.value)} className={CAMPO}>
            <option value="">Rol vacío (sin permisos)</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                Copiar de {r.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2 sm:col-span-2">
          Descripción (opcional)
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} placeholder="Para qué sirve este rol" className={CAMPO} />
        </label>
      </div>
      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
          <XCircle size={13} /> {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-lg border border-edge px-3 py-2 text-sm text-ink-2 hover:bg-surface-2">
          Cancelar
        </button>
        <button
          type="button"
          onClick={crear}
          disabled={creando || !nombre.trim()}
          className="ts-brand-button flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creando && <Loader2 size={14} className="animate-spin" />}
          Crear rol
        </button>
      </div>
    </div>
  );
}
