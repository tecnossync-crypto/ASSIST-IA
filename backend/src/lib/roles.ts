import { pool } from "../db/pool.js";

/**
 * Roles y permisos. Un rol es un conjunto de permisos; cada usuario tiene uno (`usuarios.rol` = clave del rol).
 * Los tres roles del sistema (admin, supervisor, operador) existen siempre; "admin" no se puede recortar para
 * que nadie se quede sin acceso a Configuración por accidente. Se pueden crear más roles propios.
 */

export const ALCANCES_LLAMADAS = ["ninguna", "propias", "departamento", "todas"] as const;
export const ALCANCES_CONTACTOS = ["ninguno", "propios", "todos"] as const;
export type AlcanceLlamadas = (typeof ALCANCES_LLAMADAS)[number];
export type AlcanceContactos = (typeof ALCANCES_CONTACTOS)[number];

export const CLAVES_BOOLEANAS = [
  "resumen",
  "contactos_editar",
  "contactos_eliminar",
  "campanas",
  "supervision",
  "intervenir",
  "configuracion",
  "registros_api",
  "roles",
] as const;
export type ClaveBooleana = (typeof CLAVES_BOOLEANAS)[number];

export interface Permisos {
  llamadas: AlcanceLlamadas;
  contactos: AlcanceContactos;
  resumen: boolean;
  contactos_editar: boolean;
  contactos_eliminar: boolean;
  campanas: boolean;
  supervision: boolean;
  intervenir: boolean;
  configuracion: boolean;
  registros_api: boolean;
  roles: boolean;
}

export const PERMISOS_ADMIN: Permisos = {
  llamadas: "todas",
  contactos: "todos",
  resumen: true,
  contactos_editar: true,
  contactos_eliminar: true,
  campanas: true,
  supervision: true,
  intervenir: true,
  configuracion: true,
  registros_api: true,
  roles: true,
};

const PERMISOS_SUPERVISOR: Permisos = {
  ...PERMISOS_ADMIN,
  configuracion: false,
  registros_api: false,
  roles: false,
};

const PERMISOS_OPERADOR: Permisos = {
  llamadas: "departamento",
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

export const ROLES_SISTEMA: { clave: string; nombre: string; descripcion: string; permisos: Permisos }[] = [
  { clave: "admin", nombre: "Administrador", descripcion: "Acceso total a la plataforma y a Configuración.", permisos: PERMISOS_ADMIN },
  {
    clave: "supervisor",
    nombre: "Supervisor",
    descripcion: "Ve todo lo operativo y supervisa en vivo, pero no entra a Configuración.",
    permisos: PERMISOS_SUPERVISOR,
  },
  {
    clave: "operador",
    nombre: "Agente",
    descripcion: "Atiende llamadas desde el panel de teléfono y ve las de su departamento.",
    permisos: PERMISOS_OPERADOR,
  },
];

/** Limpia cualquier cosa que llegue: solo claves conocidas, valores válidos; lo que falte queda sin permiso. */
export function normalizarPermisos(raw: unknown): Permisos {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p: Permisos = {
    llamadas: (ALCANCES_LLAMADAS as readonly string[]).includes(String(r.llamadas)) ? (r.llamadas as AlcanceLlamadas) : "ninguna",
    contactos: (ALCANCES_CONTACTOS as readonly string[]).includes(String(r.contactos)) ? (r.contactos as AlcanceContactos) : "ninguno",
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
  for (const k of CLAVES_BOOLEANAS) p[k] = r[k] === true;
  // Coherencia: editar/eliminar contactos exige poder ver contactos; intervenir exige supervisión.
  if (p.contactos === "ninguno") {
    p.contactos_editar = false;
    p.contactos_eliminar = false;
  }
  if (!p.supervision) p.intervenir = false;
  return p;
}

export function slugRol(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Crea los roles del sistema de la empresa si faltan (empresas nuevas o anteriores a esta función). */
export async function asegurarRolesSistema(empresaId: string): Promise<void> {
  for (const r of ROLES_SISTEMA) {
    await pool.query(
      `INSERT INTO roles (empresa_id, clave, nombre, descripcion, permisos, sistema)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (empresa_id, clave) DO NOTHING`,
      [empresaId, r.clave, r.nombre, r.descripcion, JSON.stringify(r.permisos)]
    );
  }
}

/** Permisos efectivos de un rol. "admin" siempre es total; un rol que ya no existe no tiene permisos. */
export async function permisosDeRol(empresaId: string, clave: string): Promise<Permisos> {
  if (clave === "admin") return PERMISOS_ADMIN;
  await asegurarRolesSistema(empresaId);
  const r = await pool.query<{ permisos: unknown }>("SELECT permisos FROM roles WHERE empresa_id = $1 AND clave = $2", [
    empresaId,
    clave,
  ]);
  if (r.rows.length === 0) return normalizarPermisos({});
  return normalizarPermisos(r.rows[0].permisos);
}

export async function rolExiste(empresaId: string, clave: string): Promise<boolean> {
  await asegurarRolesSistema(empresaId);
  const r = await pool.query("SELECT 1 FROM roles WHERE empresa_id = $1 AND clave = $2", [empresaId, clave]);
  return r.rows.length > 0;
}
