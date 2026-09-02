"use client";

import { useState } from "react";
import { ImportarContactosCSV } from "./ImportarContactosCSV";

export function CampanaContactosInput() {
  const [valor, setValor] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <textarea
        id="contactos"
        name="contactos"
        required
        rows={6}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={"+18095551234, Juan Pérez\n+18095555678"}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <p className="text-xs text-slate-400">Un número por línea. Formato: número o número, nombre.</p>
      <ImportarContactosCSV
        onImportar={(texto) => setValor((v) => (v.trim() ? `${v.trim()}\n${texto}` : texto))}
      />
    </div>
  );
}
