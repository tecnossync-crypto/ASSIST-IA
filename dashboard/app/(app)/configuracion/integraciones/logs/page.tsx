import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { PanelLogsWebhooks } from "@/components/PanelLogsWebhooks";

export default function LogsIntegracionesPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/configuracion/integraciones" className="flex items-center gap-1 text-sm text-muted hover:underline">
          <ArrowLeft size={14} />
          Volver a Integraciones
        </Link>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Inbox size={20} className="text-indigo-600" />
          Todas las llamadas API y logs
        </h1>
        <p className="text-sm text-muted">
          Cada solicitud que llegó a los webhooks públicos (llamar con IA, llamar a un agente, actualizar
          contacto, o la URL de prueba) — real o de prueba manual, con su resultado.
        </p>
      </div>

      <PanelLogsWebhooks />
    </div>
  );
}
