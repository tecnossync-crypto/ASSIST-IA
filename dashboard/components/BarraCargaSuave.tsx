// Fallback liviano para navegaciones que sí tardan un poco (no las
// normales, esas ya no muestran nada): una barrita fina arriba, con el
// degradado de marca, en vez de tapar toda la pantalla. Server Component —
// no necesita JS en el cliente, es puro CSS.
export function BarraCargaSuave() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-transparent">
      <div className="ts-brand-button h-full w-1/3 animate-[barra-carga_1.1s_ease-in-out_infinite]" />
      <style>{`
        @keyframes barra-carga {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
