import { NextResponse, type NextRequest } from "next/server";
import { decodificarSesion, NOMBRE_COOKIE_SESION } from "@/lib/session";

// Protege todo el dashboard: sin sesión válida, redirige a /login. Corre en
// Edge, por eso lib/session.ts firma con Web Crypto (no node:crypto).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(NOMBRE_COOKIE_SESION)?.value;
  const sesion = await decodificarSesion(cookie);

  if (!sesion) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
