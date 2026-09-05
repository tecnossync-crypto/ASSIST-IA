/**
 * Pantalla de carga de marca — Next.js la muestra sola (vía loading.tsx)
 * mientras la página siguiente busca sus datos, tanto al navegar dentro del
 * dashboard como al recargar. Antes de esto no había nada: la pantalla se
 * quedaba en blanco un instante, lo cual se siente poco pulido.
 */
export function PantallaCarga() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex h-16 w-16 items-center justify-center">
          {/* Anillo girando alrededor del logo */}
          <span className="absolute inset-0 animate-spin rounded-2xl border-2 border-transparent border-t-indigo-400 border-r-violet-400" />
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-black text-white shadow-lg shadow-indigo-500/40">
            V
          </span>
        </div>

        <div className="text-center">
          <p className="ts-brand-title text-lg font-black tracking-tight">Tecnossync</p>
          <p className="text-xs font-medium tracking-wide text-slate-400">Voz IA</p>
        </div>

        <div className="flex gap-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400" />
        </div>
      </div>
    </div>
  );
}
