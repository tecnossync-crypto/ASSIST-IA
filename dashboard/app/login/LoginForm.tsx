"use client";

import { useActionState } from "react";
import { Mail, Lock, AlertCircle, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { loginAction, verificar2FAAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  if (state?.requiere2fa && state.desafioToken) {
    return <Codigo2FAForm desafioToken={state.desafioToken} next={next} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-ink-2">
          Email
        </label>
        <div className="relative">
          <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            placeholder="tu@empresa.com"
            className="w-full rounded-lg border border-edge py-2.5 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-ink-2">
          Contraseña
        </label>
        <div className="relative">
          <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="••••••••"
            className="w-full rounded-lg border border-edge py-2.5 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="ts-brand-button mt-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
      >
        {pending && <Loader2 size={15} className="animate-spin" />}
        {pending ? "Entrando…" : "Entrar"}
      </button>

      {state?.error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={13} className="flex-shrink-0" />
          {state.error}
        </p>
      )}
    </form>
  );
}

// Segundo paso, solo cuando el usuario tiene 2FA activo: código de 6
// dígitos de la app autenticadora, o un código de respaldo ("XXXX-XXXX") si
// perdió el teléfono.
function Codigo2FAForm({ desafioToken, next }: { desafioToken: string; next: string }) {
  const [state, formAction, pending] = useActionState(verificar2FAAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="desafioToken" value={state?.desafioToken ?? desafioToken} />

      <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 text-sm text-indigo-800">
        <ShieldCheck size={16} className="flex-shrink-0" />
        Ingresa el código de tu app autenticadora
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="codigo" className="text-sm font-medium text-ink-2">
          Código
        </label>
        <input
          id="codigo"
          name="codigo"
          required
          autoFocus
          inputMode="text"
          placeholder="123456 o XXXX-XXXX"
          className="w-full rounded-lg border border-edge py-2.5 px-3 text-center text-lg tracking-widest focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-muted">
          ¿Perdiste el teléfono? Usa uno de tus códigos de respaldo en vez del código de 6 dígitos.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="ts-brand-button mt-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow shadow-indigo-500/30 disabled:opacity-60"
      >
        {pending && <Loader2 size={15} className="animate-spin" />}
        {pending ? "Verificando…" : "Verificar"}
      </button>

      {state?.error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={13} className="flex-shrink-0" />
          {state.error}
        </p>
      )}

      <a href="/login" className="flex items-center justify-center gap-1.5 text-xs text-muted hover:text-ink-2">
        <ArrowLeft size={12} />
        Volver a intentar con otra cuenta
      </a>
    </form>
  );
}
