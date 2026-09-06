import { BarraCargaSuave } from "@/components/BarraCargaSuave";

// Ya no es la pantalla de marca completa — el layout de acá arriba resuelve
// al instante (no pide nada al backend), así que este fallback solo se ve
// si una página puntual tarda de verdad en cargar sus propios datos. Una
// barrita fina, no bloquea nada de lo que ya está en pantalla.
export default function Loading() {
  return <BarraCargaSuave />;
}
