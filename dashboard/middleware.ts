import { NextResponse, type NextRequest } from "next/server";
import { decodificarSesion, NOMBRE_COOKIE_SESION } from "@/lib/session";
import { permisosDe, type Permisos } from "@/lib/permisos";

// Rutas que deben quedar públicas SIN sesión: la página de login, assets de
// Next, y el webhook externo (POST /api/webhooks/llamadas) que se autentica
// con su propio API key, no con la cookie de sesión del dashboard.
const PUBLICAS = ["/login", "/_next", "/favicon.ico", "/api/webhooks"];

// Qué permiso exige cada zona (ver lib/permisos.ts y Configuración → Roles y permisos). Va de lo más
// específico a lo más general: gana la primera regla que coincida. Esto es solo la puerta de entrada por URL;
// el menú oculta lo mismo y cada página/acción vuelve a comprobar el alcance de lo que muestra.
const REGLAS: { prefijos: string[]; permitido: (p: Permisos) => boolean }[] = [
  { prefijos: ["/configuracion/roles"], permitido: (p) => p.configuracion && p.roles },
  { prefijos: ["/configuracion", "/api/grabaciones", "/api/clonar-voz", "/api/reglas-api-llamadas"], permitido: (p) => p.configuracion },
  { prefijos: ["/api-logs", "/api/logs-webhooks"], permitido: (p) => p.registros_api },
  { prefijos: ["/api/monitoreo/intervenir"], permitido: (p) => p.supervision && p.intervenir },
  { prefijos: ["/supervision", "/api/monitoreo", "/api/supervision"], permitido: (p) => p.supervision },
  { prefijos: ["/campanas", "/api/campanas"], permitido: (p) => p.campanas },
  { prefijos: ["/api/contactos/por-etiqueta"], permitido: (p) => p.campanas || p.contactos !== "ninguno" },
  { prefijos: ["/api/contactos/importar"], permitido: (p) => p.contactos === "todos" && p.contactos_editar },
  { prefijos: ["/contactos", "/api/contactos"], permitido: (p) => p.contactos !== "ninguno" },
];
// A dónde mandar a quien cae en una ruta que no le toca. /llamadas nunca se bloquea (si no tiene acceso a
// llamadas, la propia página lo explica), así que no puede haber un bucle de redirecciones.
const DESTINO_SIN_PERMISO = "/llamadas";

// Protege todo el dashboard (páginas Y rutas /api propias): sin sesión
// válida, redirige a /login o responde 401/403 si es una API. Corre en
// Edge, por eso lib/session.ts firma con Web Crypto (no node:crypto).
//
// OJO: antes esto excluía TODO /api del matcher, así que cualquiera en
// internet podía pegarle directo a /api/llamar, /api/contactos/importar,
// etc. sin loguearse — el backend tampoco valida sesión (fase 1, confía en
// que el dashboard ya filtró). Ahora todo pasa por acá primero.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const esApi = pathname.startsWith("/api");

  if (PUBLICAS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(NOMBRE_COOKIE_SESION)?.value;
  const sesion = await decodificarSesion(cookie);

  if (!sesion) {
    if (esApi) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const permisos = permisosDe(sesion);
  const regla = REGLAS.find((r) => r.prefijos.some((p) => pathname.startsWith(p)));
  const sinPermiso = regla ? !regla.permitido(permisos) : pathname === "/" && !permisos.resumen;

  if (sinPermiso) {
    if (esApi) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = DESTINO_SIN_PERMISO;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
