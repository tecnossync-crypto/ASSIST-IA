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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/llamadas" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black text-white shadow shadow-indigo-500/30">
                V
              </span>
              <span className="text-lg font-black tracking-tight text-white">
                Tecnossync <span className="font-medium text-slate-400">· Voz IA</span>
              </span>
            </a>
            <nav className="flex gap-1 text-sm">
              <a
                href="/llamadas"
                className="rounded-lg px-3 py-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                Llamadas
              </a>
              <a
                href="/configuracion"
                className="rounded-lg px-3 py-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                Configuración
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
