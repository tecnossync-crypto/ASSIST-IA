import { obtenerSesion } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const EMPRESA_ID = process.env.NEXT_PUBLIC_EMPRESA_ID ?? "";

// Proxy de streaming: solo admin puede exportar todas las grabaciones de la
// empresa en un .zip. Se pasa el stream de la respuesta del backend
// directo al navegador, sin bufferear el zip completo en memoria acá.
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "admin") {
    return new Response("No autorizado", { status: 403 });
  }

  const url = new URL("/api/grabaciones/exportar", BACKEND_URL);
  url.searchParams.set("empresaId", EMPRESA_ID);
  const res = await fetch(url);

  if (!res.ok || !res.body) {
    const texto = await res.text().catch(() => "Error exportando grabaciones");
    return new Response(texto, { status: res.status || 502 });
  }

  return new Response(res.body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": res.headers.get("content-disposition") ?? 'attachment; filename="grabaciones.zip"',
    },
  });
}
