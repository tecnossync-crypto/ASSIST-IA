import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tecnossync — Voz IA",
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
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_PARPADEO }} />
      </head>
      <body className="h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
