"use client";

import { useActionState } from "react";
import { Mail, Lock, AlertCircle, Loader2 } from "lucide-react";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

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
