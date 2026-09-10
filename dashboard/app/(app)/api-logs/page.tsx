import { Terminal } from "lucide-react";
import { PanelLogsWebhooks } from "@/components/PanelLogsWebhooks";

export default function ApiLogsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Terminal size={20} className="text-indigo-600" />
          Registros API
        </h1>
        <p className="text-sm text-muted">
          Cada solicitud que llegó a los webhooks públicos (llamar con IA, llamar a un agente, actualizar
          contacto, o la URL de prueba) — real o de prueba manual. Click en una fila para ver el detalle
          completo.
        </p>
      </div>

      <PanelLogsWebhooks />
    </div>
  );
}
