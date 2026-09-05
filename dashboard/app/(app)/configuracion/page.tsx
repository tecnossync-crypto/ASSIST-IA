import Link from "next/link";
import { Building2, Bot, Users, Workflow, Headset, History, Plug, HardDrive, ChevronRight } from "lucide-react";

const SECCIONES = [
  {
    href: "/configuracion/empresa",
    Icon: Building2,
    titulo: "Empresa",
    descripcion: "Nombre y número(s) de transferencia.",
  },
  {
    href: "/configuracion/ia",
    Icon: Bot,
    titulo: "Inteligencia Artificial",
    descripcion: "Prompt, voz, tiempo de respuesta y gestor de llamadas.",
  },
  {
    href: "/configuracion/contactos",
    Icon: Users,
    titulo: "Contactos",
    descripcion: "Campos a recolectar y etiquetas para organizar clientes.",
  },
  {
    href: "/configuracion/flujos",
    Icon: Workflow,
    titulo: "Flujos de trabajo",
    descripcion: "Reglas automáticas según el resultado de la llamada.",
  },
  {
    href: "/configuracion/agentes",
    Icon: Headset,
    titulo: "Agentes",
    descripcion: "Quiénes reciben las llamadas normales, organizados por cola.",
  },
  {
    href: "/configuracion/auditoria",
    Icon: History,
    titulo: "Auditoría",
    descripcion: "Quién cambió qué en Configuración, y cuándo.",
  },
  {
    href: "/configuracion/integraciones",
    Icon: Plug,
    titulo: "Integraciones",
    descripcion: "API para pedir llamadas por webhook, y conexiones con otras plataformas.",
  },
  {
    href: "/configuracion/almacenamiento",
    Icon: HardDrive,
    titulo: "Almacenamiento",
    descripcion: "Uso de espacio, retención, exportar grabaciones y sincronizarlas a tu nube.",
  },
];

export default function ConfiguracionHubPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted">Elige qué parte de la plataforma quieres ajustar.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECCIONES.map(({ href, Icon, titulo, descripcion }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-4 rounded-xl border border-edge bg-surface p-5 transition-all hover:border-indigo-300 hover:shadow-sm"
          >
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow shadow-indigo-500/30">
              <Icon size={20} />
            </span>
            <div className="flex-1">
              <p className="font-medium text-ink group-hover:text-indigo-700">{titulo}</p>
              <p className="mt-0.5 text-sm text-muted">{descripcion}</p>
            </div>
            <ChevronRight size={18} className="mt-2 flex-shrink-0 text-slate-300 group-hover:text-indigo-500" />
          </Link>
        ))}
      </div>
    </div>
  );
}
