/**
 * Roles y permisos (lado dashboard). Sin dependencias de servidor: lo usan el middleware (Edge), las páginas y el
 * Sidebar (cliente). El catálogo de abajo es lo que dibuja la pantalla Configuración → Roles y permisos.
 *
 * Los permisos de la sesión se guardan en la cookie al iniciar sesión: un cambio de rol se aplica a cada
 * usuario la próxima vez que inicia sesión.
 */

export type AlcanceLlamadas = "ninguna" | "propias" | "departamento" | "todas";
export type AlcanceContactos = "ninguno" | "propios" | "todos";

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

const TODO: Permisos = {
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

/** Sesiones anteriores a los roles configurables (cookie sin permisos): se deducen del rol de siempre. */
const POR_ROL: Record<string, Permisos> = {
  admin: TODO,
  supervisor: { ...TODO, configuracion: false, registros_api: false, roles: false },
  operador: {
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
  },
};

const SIN_PERMISOS: Permisos = { ...POR_ROL.operador, llamadas: "ninguna" };

export function permisosDe(sesion: { rol: string; permisos?: Permisos | null } | null | undefined): Permisos {
  if (!sesion) return SIN_PERMISOS;
  if (sesion.rol === "admin") return TODO;
  return sesion.permisos ?? POR_ROL[sesion.rol] ?? SIN_PERMISOS;
}

/** Qué llamadas puede ver esta sesión, ya traducido a los filtros que entiende el backend. */
export function filtroLlamadas(
  sesion: { rol: string; usuarioId: string; colaId: string | null; permisos?: Permisos | null } | null
): { sinAcceso: boolean; colaId?: string; agenteId?: string } {
  const p = permisosDe(sesion);
  if (!sesion || p.llamadas === "ninguna") return { sinAcceso: true };
  if (p.llamadas === "propias") return { sinAcceso: false, agenteId: sesion.usuarioId };
  if (p.llamadas === "departamento") {
    return sesion.colaId ? { sinAcceso: false, colaId: sesion.colaId } : { sinAcceso: true };
  }
  return { sinAcceso: false };
}

// ───────────────────────── Catálogo para la pantalla de roles ─────────────────────────

export interface OpcionAlcance<T extends string> {
  valor: T;
  etiqueta: string;
  detalle: string;
}

export const ALCANCES_LLAMADAS: OpcionAlcance<AlcanceLlamadas>[] = [
  { valor: "ninguna", etiqueta: "Ninguna", detalle: "No ve el listado de llamadas." },
  { valor: "propias", etiqueta: "Solo las suyas", detalle: "Únicamente las llamadas que atendió él." },
  { valor: "departamento", etiqueta: "Su departamento", detalle: "Las de su departamento (cola)." },
  { valor: "todas", etiqueta: "Todas", detalle: "Todas las llamadas de la empresa." },
];

export const ALCANCES_CONTACTOS: OpcionAlcance<AlcanceContactos>[] = [
  { valor: "ninguno", etiqueta: "Ninguno", detalle: "No entra a Contactos." },
  { valor: "propios", etiqueta: "Solo los suyos", detalle: "Los que tiene asignados y los clientes que atendió." },
  { valor: "todos", etiqueta: "Todos", detalle: "Todos los contactos de la empresa." },
];

export type ClaveBooleana = Exclude<keyof Permisos, "llamadas" | "contactos">;

export interface GrupoPermisos {
  titulo: string;
  descripcion: string;
  alcance?: "llamadas" | "contactos";
  items: { clave: ClaveBooleana; etiqueta: string; detalle: string }[];
}

export const GRUPOS_PERMISOS: GrupoPermisos[] = [
  {
    titulo: "Llamadas",
    descripcion: "Qué llamadas puede ver en el listado, con su resumen, transcripción y grabación.",
    alcance: "llamadas",
    items: [],
  },
  {
    titulo: "Contactos",
    descripcion: "Qué clientes puede ver y qué puede hacer con ellos.",
    alcance: "contactos",
    items: [
      { clave: "contactos_editar", etiqueta: "Editar contactos", detalle: "Cambiar datos, etiquetas y notas." },
      { clave: "contactos_eliminar", etiqueta: "Eliminar contactos", detalle: "Borrar el perfil de un cliente." },
    ],
  },
  {
    titulo: "Secciones",
    descripcion: "Pantallas del menú a las que puede entrar.",
    items: [
      { clave: "resumen", etiqueta: "Resumen", detalle: "Métricas generales de la línea." },
      { clave: "campanas", etiqueta: "Campañas", detalle: "Crear y ver campañas de llamadas." },
    ],
  },
  {
    titulo: "Supervisión",
    descripcion: "Vigilar el trabajo del equipo en vivo.",
    items: [
      { clave: "supervision", etiqueta: "Supervisión en vivo", detalle: "Ver y escuchar las llamadas en curso, y el tiempo conectado del equipo." },
      { clave: "intervenir", etiqueta: "Intervenir en llamadas", detalle: "Hablar dentro de una llamada que está escuchando." },
    ],
  },
  {
    titulo: "Administración",
    descripcion: "Acceso a la configuración de la plataforma. Dalo solo a personas de confianza.",
    items: [
      { clave: "configuracion", etiqueta: "Configuración", detalle: "Empresa, IA, agentes, enrutamiento, integraciones y almacenamiento." },
      { clave: "registros_api", etiqueta: "Registros API", detalle: "Ver lo que llegó a los webhooks públicos." },
      { clave: "roles", etiqueta: "Roles y permisos", detalle: "Crear roles y cambiar lo que puede hacer cada uno." },
    ],
  },
];
