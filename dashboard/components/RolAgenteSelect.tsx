"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cambiarRolAgenteAction } from "@/app/(app)/configuracion/roles/actions";

// Cambia el rol de un usuario que ya existe (qué ve y qué puede hacer). Los permisos de cada rol se definen en
// Configuración → Roles y permisos; el cambio le llega al usuario la próxima vez que inicie sesión.
export function RolAgenteSelect({
  agenteId,
  rolActual,
  roles,
}: {
  agenteId: string;
  rolActual: string;
  roles: { clave: string; nombre: string }[];
}) {
  const [valor, setValor] = useState(rolActual);
  const [resultado, setResultado] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [guardando, startTransition] = useTransition();

  useEffect(() => {
    setValor(rolActual);
  }, [rolActual]);

  function cambiar(nuevo: string) {
    const anterior = valor;
    setValor(nuevo);
    setResultado(null);
    startTransition(async () => {
      const r = await cambiarRolAgenteAction(agenteId, nuevo);
      setResultado(r);
      if (r.error) setValor(anterior);
      else setTimeout(() => setResultado(null), 2500);
    });
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      Rol
      <select
        value={valor}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-md border border-edge px-2 py-1 text-xs text-ink focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {roles.map((r) => (
          <option key={r.clave} value={r.clave}>
            {r.nombre}
          </option>
        ))}
        {!roles.some((r) => r.clave === valor) && <option value={valor}>{valor}</option>}
      </select>
      {guardando && <Loader2 size={12} className="animate-spin" />}
      {resultado?.ok && <CheckCircle2 size={13} className="text-emerald-600" aria-label="Guardado" />}
      {resultado?.error && (
        <span className="flex items-center gap-1 text-red-600" title={resultado.error}>
          <XCircle size={13} /> {resultado.error}
        </span>
      )}
    </label>
  );
}
