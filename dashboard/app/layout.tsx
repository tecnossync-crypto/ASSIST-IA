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

// Layout raíz mínimo: solo <html>/<body> + fuentes. El "shell" real
// (Sidebar, panel de teléfono, softphone) vive en app/(app)/layout.tsx para
// que NO aparezca en /login.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
