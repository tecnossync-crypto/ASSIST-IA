/**
 * Franja de aviso en el ambiente de QA: que nadie confunda las pruebas con la
 * plataforma real. En producción no muestra nada. NEXT_PUBLIC_ENTORNO y
 * NEXT_PUBLIC_APP_VERSION se fijan al compilar (ver docker-compose.qa.yml).
 */
export function BannerEntorno() {
  if (process.env.NEXT_PUBLIC_ENTORNO !== "qa") return null;
  const version = process.env.NEXT_PUBLIC_APP_VERSION;

  return (
    <div className="shrink-0 bg-amber-400 px-3 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-amber-950">
      Ambiente de pruebas (QA) · nada de aquí es producción · solo se llama a números autorizados
      {version ? ` · versión ${version}` : ""}
    </div>
  );
}
