"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check, ShieldAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";

type Paso = "cerrado" | "cargando_qr" | "confirmar" | "codigos_respaldo" | "desactivando";

// Activar/desactivar 2FA (app autenticadora) para un usuario, desde
// Configuración → Agentes. Flujo: iniciar (genera QR, aún no activo) →
// confirmar con un código real de la app (recién ahí queda activo) →
// muestra los códigos de respaldo UNA sola vez.
export function Configurar2FA({ id, habilitado }: { id: string; habilitado: boolean }) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("cerrado");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [claveManual, setClaveManual] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigosRespaldo, setCodigosRespaldo] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function iniciar() {
    setPaso("cargando_qr");
    setError("");
    try {
      const res = await fetch(`/api/agentes/${id}/2fa/iniciar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo generar el código QR");
      setQrDataUrl(data.qrDataUrl);
      setClaveManual(data.claveManual);
      setPaso("confirmar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setPaso("cerrado");
    }
  }

  async function confirmar() {
    if (codigo.length < 6) return;
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`/api/agentes/${id}/2fa/confirmar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Código incorrecto");
      setCodigosRespaldo(data.codigosRespaldo ?? []);
      setPaso("codigos_respaldo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCargando(false);
    }
  }

  async function desactivar() {
    if (!window.confirm("¿Desactivar la autenticación de dos pasos para este usuario?")) return;
    setCargando(true);
    try {
      await fetch(`/api/agentes/${id}/2fa/desactivar`, { method: "POST" });
      router.refresh();
      setPaso("cerrado");
    } finally {
      setCargando(false);
    }
  }

  function terminar() {
    setPaso("cerrado");
    setCodigo("");
    router.refresh();
  }

  async function copiarCodigos() {
    try {
      await navigator.clipboard.writeText(codigosRespaldo.join("\n"));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // portapapeles no disponible — el usuario puede seleccionarlos a mano
    }
  }

  if (paso === "cerrado") {
    return habilitado ? (
      <button
        type="button"
        onClick={desactivar}
        disabled={cargando}
        className="flex items-center gap-1 text-sm text-red-700 hover:underline disabled:opacity-60"
      >
        {cargando ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />}
        Desactivar 2FA
      </button>
    ) : (
      <button type="button" onClick={iniciar} className="flex items-center gap-1 text-sm text-indigo-700 hover:underline">
        <ShieldCheck size={13} />
        Activar 2FA
      </button>
    );
  }

  if (paso === "cargando_qr") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Loader2 size={12} className="animate-spin" /> Generando código QR…
      </span>
    );
  }

  if (paso === "confirmar") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 text-sm">
        <div className="flex items-center justify-between">
          <p className="font-medium text-ink">Escanea con tu app autenticadora</p>
          <button type="button" onClick={() => setPaso("cerrado")} aria-label="Cancelar" className="text-muted hover:text-ink-2">
            <X size={14} />
          </button>
        </div>
        <div className="flex items-start gap-4">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Código QR para 2FA" width={140} height={140} className="rounded-md border border-edge bg-white p-1" />
          )}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              Escanea con Google Authenticator, Authy o similar. Si no puedes escanear, escribe esta clave a mano:
            </p>
            <code className="rounded border border-indigo-200 bg-surface px-2 py-1 text-xs">{claveManual}</code>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="Código de 6 dígitos"
              className="w-40 rounded-md border border-edge px-2.5 py-1.5 text-sm tracking-widest focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={confirmar}
              disabled={codigo.length < 6 || cargando}
              className="ts-brand-button self-start rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {cargando ? "Verificando…" : "Confirmar y activar"}
            </button>
          </div>
        </div>
        {error && (
          <p className="flex items-center gap-1 text-xs text-red-600">
            <ShieldAlert size={12} /> {error}
          </p>
        )}
      </div>
    );
  }

  // codigos_respaldo
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
      <p className="font-medium">2FA activado. Guarda estos códigos de respaldo — no se volverán a mostrar.</p>
      <p className="text-xs">Sirven para entrar si pierdes el teléfono con la app autenticadora (uno solo por vez).</p>
      <div className="grid grid-cols-2 gap-1.5 rounded border border-emerald-300 bg-surface p-2 font-mono text-xs">
        {codigosRespaldo.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={copiarCodigos}
          className="flex items-center gap-1 rounded-md border border-emerald-300 bg-surface px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
        >
          {copiado ? <Check size={13} /> : <Copy size={13} />}
          {copiado ? "Copiados" : "Copiar todos"}
        </button>
        <button type="button" onClick={terminar} className="text-xs font-medium text-emerald-800 hover:underline">
          Listo
        </button>
      </div>
    </div>
  );
}
