"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X } from "lucide-react";

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Círculo de avatar con overlay de cámara al pasar el mouse — click abre el
// selector de archivo y sube de inmediato (sin botón "Guardar" aparte).
// `editable=false` lo deja como solo lectura (para listas, headers, etc.).
export function AvatarUsuario({
  id,
  nombre,
  tieneAvatar,
  editable = true,
  size = 40,
}: {
  id: string;
  nombre: string;
  tieneAvatar: boolean;
  editable?: boolean;
  size?: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [tiene, setTiene] = useState(tieneAvatar);
  const [error, setError] = useState("");
  // Cache-buster para que el <img> recargue apenas se sube una nueva foto,
  // sin esto el navegador podía seguir mostrando la anterior desde caché.
  const [version, setVersion] = useState(0);

  async function subir(archivo: File) {
    setError("");
    setSubiendo(true);
    try {
      const formData = new FormData();
      formData.append("file", archivo);
      const res = await fetch(`/api/agentes/${id}/avatar`, { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo subir la imagen");
      setTiene(true);
      setVersion((v) => v + 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar(e: React.MouseEvent) {
    e.stopPropagation();
    setSubiendo(true);
    try {
      await fetch(`/api/agentes/${id}/avatar`, { method: "DELETE" });
      setTiene(false);
      router.refresh();
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={() => editable && inputRef.current?.click()}
        style={{ width: size, height: size }}
        className={
          "group relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white " +
          (editable ? "cursor-pointer" : "")
        }
      >
        {tiene ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/agentes/${id}/avatar?v=${version}`}
            alt={nombre}
            className="h-full w-full object-cover"
          />
        ) : (
          <span style={{ fontSize: size * 0.4 }} className="font-bold">
            {iniciales(nombre)}
          </span>
        )}

        {editable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            {subiendo ? <Loader2 size={size * 0.4} className="animate-spin" /> : <Camera size={size * 0.4} />}
          </div>
        )}

        {editable && tiene && !subiendo && (
          <button
            type="button"
            onClick={quitar}
            aria-label="Quitar foto"
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow group-hover:opacity-100"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) subir(archivo);
            e.target.value = "";
          }}
        />
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
