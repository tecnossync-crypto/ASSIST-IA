import { PhoneCall, Bot, CalendarClock, ShieldCheck } from "lucide-react";
import { LoginForm } from "./LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";

const PUNTOS = [
  { Icon: PhoneCall, titulo: "Todas las llamadas en un solo lugar", texto: "Entrantes, salientes y de campaña, con grabación y resumen." },
  { Icon: Bot, titulo: "Asistente de voz con IA", texto: "Atiende, califica y transfiere al asesor correcto." },
  { Icon: CalendarClock, titulo: "Seguimiento por asesor", texto: "Cada cliente con su historial y cuándo volver a contactarlo." },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Panel de marca */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-b from-slate-900 to-indigo-950 p-12 text-white lg:flex">
        {/* Trama discreta */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-base font-semibold ring-1 ring-white/20">
            V
          </span>
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight">Tecnossync</p>
            <p className="text-xs text-indigo-200">Plataforma de Voz IA</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            La central de atención telefónica de tu empresa, con inteligencia artificial.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Atiende, da seguimiento y deriva a tu equipo desde un único panel.
          </p>

          <ul className="mt-10 flex flex-col gap-5">
            {PUNTOS.map(({ Icon, titulo, texto }) => (
              <li key={titulo} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06]">
                  <Icon size={16} className="text-indigo-200" />
                </span>
                <div>
                  <p className="text-sm font-medium">{titulo}</p>
                  <p className="text-xs leading-relaxed text-slate-400">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} Tecnossync. Todos los derechos reservados.</p>
      </aside>

      {/* Formulario */}
      <main className="relative flex flex-col items-center justify-center px-6 py-12 sm:px-10">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">V</span>
            <div className="leading-tight">
              <p className="text-base font-semibold tracking-tight text-ink">Tecnossync</p>
              <p className="text-xs text-muted">Plataforma de Voz IA</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-ink">Bienvenido</h2>
          <p className="mb-7 mt-1 text-sm text-muted">Ingresa con tu correo y contraseña para continuar.</p>

          <LoginForm next={next ?? "/"} />

          <p className="mt-8 flex items-start gap-2 border-t border-edge pt-5 text-xs leading-relaxed text-muted">
            <ShieldCheck size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              Acceso solo para personal autorizado. ¿Olvidaste tu contraseña? Pídele al administrador que te asigne una nueva.
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}
