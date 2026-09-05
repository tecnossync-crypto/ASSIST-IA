import { NextResponse, type NextRequest } from "next/server";
import { decodificarSesion, NOMBRE_COOKIE_SESION } from "@/lib/session";

// Rutas que deben quedar públicas SIN sesión: la página de login, assets de
// Next, y el webhook externo (POST /api/webhooks/llamadas) que se autentica
// con su propio API key, no con la cookie de sesión del dashboard.
const PUBLICAS = ["/login", "/_next", "/favicon.ico", "/api/webhooks"];

// Solo el admin debería poder tocar esto — la Sidebar ya oculta el link de
// Configuración a los operadores, pero eso es solo cosmético: sin esto,
// cualquiera con sesión (incluso un operador) podía entrar directo por URL
// y, por ejemplo, generar el API key o escuchar llamadas en vivo.
const SOLO_ADMIN = [
  "/configuracion",
  "/supervision",
  "/api/monitoreo",
  "/api/grabaciones",
  "/api/clonar-voz",
  "/api/supervision",
];

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

  if (SOLO_ADMIN.some((p) => pathname.startsWith(p)) && sesion.rol !== "admin") {
    if (esApi) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
