import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// En QA la pestaña dice "[QA]": se distingue de producción de un vistazo.
const PREFIJO_TITULO = process.env.NEXT_PUBLIC_ENTORNO === "qa" ? "[QA] " : "";

export const metadata: Metadata = {
  title: `${PREFIJO_TITULO}Tecnossync — Voz IA`,
  description: "Historial de llamadas atendidas por el agente de voz IA de Tecnossync",
};

// Se corre inline, antes de pintar, para que la página nunca arranque en
// claro y "parpadee" a oscuro un instante después (o viceversa). No puede
// vivir en un componente normal porque esos corren después del primer pintado.
const SCRIPT_ANTI_PARPADEO = `
  (function () {
    try {
      var guardado = localStorage.getItem("tema_voz_ia");
      if (guardado === "light" || guardado === "dark") {
        document.documentElement.setAttribute("data-theme", guardado);
      }
    } catch (e) {}
  })();
`;

// Layout raíz mínimo: solo <html>/<body> + fuentes. El "shell" real
// (Sidebar, panel de teléfono, softphone) vive en app/(app)/layout.tsx para
// que NO aparezca en /login.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_PARPADEO }} />
      </head>
      <body className="h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
