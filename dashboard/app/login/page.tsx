import { PhoneCall, Bot, BarChart3 } from "lucide-react";
import { LoginForm } from "./LoginForm";

const PUNTOS = [
  { Icon: PhoneCall, texto: "Llamadas entrantes y salientes en un solo lugar" },
  { Icon: Bot, texto: "Agente de IA configurable a tu medida" },
  { Icon: BarChart3, texto: "Reportes de satisfacción y desempeño en vivo" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 md:grid-cols-2">
        {/* Panel de marca */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-10 text-white md:flex">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />

          <div className="relative">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black shadow shadow-indigo-500/30">
              V
            </span>
            <h1 className="mt-6 text-2xl font-black tracking-tight">
              Tecnossync
              <span className="block text-sm font-medium text-indigo-300">Plataforma de Voz IA</span>
            </h1>
          </div>

          <ul className="relative flex flex-col gap-4">
            {PUNTOS.map(({ Icon, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon size={15} />
                </span>
                {texto}
              </li>
            ))}
          </ul>

          <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} Tecnossync</p>
        </div>

        {/* Panel de login */}
        <div className="flex flex-col justify-center p-8 sm:p-10">
          <div className="mb-6 md:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black text-white">
              V
            </span>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Iniciar sesión</h2>
          <p className="mb-6 text-sm text-slate-500">Entra con el email y contraseña de tu cuenta.</p>
          <LoginForm next={next ?? "/"} />
        </div>
      </div>
    </div>
  );
}
