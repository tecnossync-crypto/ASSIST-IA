"use server";

import { revalidatePath } from "next/cache";
import {
  regenerarApiKey,
  probarWebhook,
  type EndpointWebhookPrueba,
  crearReglaApiLlamadas,
  actualizarReglaApiLlamadas,
  eliminarReglaApiLlamadas,
  probarReglasApiLlamadas,
  type ResultadoPruebaRegla,
} from "@/lib/api";
import { auditar } from "@/lib/session";

export async function regenerarApiKeyAction(): Promise<{ apiKey: string }> {
  const { apiKey } = await regenerarApiKey();
  revalidatePath("/configuracion/integraciones");
  await auditar("regenerar", "api_key", {});
  return { apiKey };
}

export async function probarWebhookAction(
  endpoint: EndpointWebhookPrueba,
  payload: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const resultado = await probarWebhook(endpoint, payload);
  revalidatePath("/configuracion/integraciones");
  return resultado;
}

export interface EstadoRegla {
  error?: string;
  ok?: boolean;
}

interface DatosRegla {
  nombre: string;
  campo: string;
  operador: string;
  valor: string;
  promptPersonalizado: string;
  retrasoMinutos: number | null;
  fechaProgramada: string | null;
  horaDelDia: string | null;
  zonaHoraria: string | null;
}

// Lee y valida el formulario de una regla (el mismo para crear y para editar).
function leerFormularioRegla(formData: FormData): { error: string } | { datos: DatosRegla } {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const campo = String(formData.get("campo") ?? "").trim();
  const operador = String(formData.get("operador") ?? "igual");
  const valor = String(formData.get("valor") ?? "").trim();
  const promptPersonalizado = String(formData.get("promptPersonalizado") ?? "").trim();

  if (!nombre || !campo || (operador !== "existe" && !valor) || !promptPersonalizado) {
    return { error: "Todos los campos son requeridos." };
  }

  // Horario opcional de la llamada cuando la regla aplica: sin nada = al
  // instante; "espera" = N minutos/horas/días; "fecha" = fecha y hora fija
  // (el navegador la manda ya en ISO con su zona, ver ReglasApiLlamadas.tsx).
  const cuando = String(formData.get("cuando") ?? "ahora");
  let retrasoMinutos: number | null = null;
  let fechaProgramada: string | null = null;
  let horaDelDia: string | null = null;
  let zonaHoraria: string | null = null;
  if (cuando === "hora") {
    horaDelDia = String(formData.get("hora_del_dia") ?? "").trim();
    zonaHoraria = String(formData.get("zona_horaria") ?? "").trim() || null;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horaDelDia)) return { error: "Elige la hora del día en que debe llamar." };
  } else if (cuando === "espera") {
    const cantidad = Math.floor(Number(formData.get("espera_cantidad") ?? 0));
    const unidad = String(formData.get("espera_unidad") ?? "minutos");
    const porUnidad = unidad === "dias" ? 1440 : unidad === "horas" ? 60 : 1;
    if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: "Indica cuánto tiempo esperar." };
    retrasoMinutos = Math.min(cantidad * porUnidad, 90 * 24 * 60);
  } else if (cuando === "fecha") {
    fechaProgramada = String(formData.get("fecha_iso") ?? "").trim();
    if (!fechaProgramada) return { error: "Elige la fecha y hora de la llamada." };
  }

  return {
    datos: { nombre, campo, operador, valor, promptPersonalizado, retrasoMinutos, fechaProgramada, horaDelDia, zonaHoraria },
  };
}

export async function crearReglaAction(_prevState: EstadoRegla | null, formData: FormData): Promise<EstadoRegla> {
  const leido = leerFormularioRegla(formData);
  if ("error" in leido) return { error: leido.error };

  try {
    await crearReglaApiLlamadas(leido.datos);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la regla." };
  }

  revalidatePath("/configuracion/integraciones");
  await auditar("crear", "regla_api_llamadas", {
    nombre: leido.datos.nombre,
    campo: leido.datos.campo,
    valor: leido.datos.valor,
  });
  return { ok: true };
}

// Edita una regla existente: condición, guion (prompt) y horario.
export async function editarReglaAction(_prevState: EstadoRegla | null, formData: FormData): Promise<EstadoRegla> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta la regla a editar." };
  const leido = leerFormularioRegla(formData);
  if ("error" in leido) return { error: leido.error };
  const d = leido.datos;

  try {
    await actualizarReglaApiLlamadas(id, {
      nombre: d.nombre,
      campo: d.campo,
      operador: d.operador,
      valor: d.valor,
      promptPersonalizado: d.promptPersonalizado,
      horario: {
        retrasoMinutos: d.retrasoMinutos,
        fechaProgramada: d.fechaProgramada,
        horaDelDia: d.horaDelDia,
        zonaHoraria: d.zonaHoraria,
      },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando la regla." };
  }

  revalidatePath("/configuracion/integraciones");
  try {
    await auditar("actualizar", "regla_api_llamadas", { id, nombre: d.nombre });
  } catch {
    // La auditoría no debe impedir que el cambio se vea como guardado.
  }
  return { ok: true };
}

export async function probarReglasAction(
  textoJson: string
): Promise<{ resultado?: ResultadoPruebaRegla; error?: string }> {
  let payload: unknown;
  try {
    payload = JSON.parse(textoJson);
  } catch {
    return { error: "Eso no es un JSON válido. Revisa las comillas y las comas." };
  }
  try {
    return { resultado: await probarReglasApiLlamadas(payload) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo probar." };
  }
}

// Activa o desactiva una regla. Devuelve el error en vez de lanzarlo para que
// el interruptor pueda volver a su posición y mostrar el motivo.
export async function alternarReglaAction(id: string, activa: boolean): Promise<{ ok?: boolean; error?: string }> {
  try {
    await actualizarReglaApiLlamadas(id, { activa });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo cambiar el estado." };
  }
  revalidatePath("/configuracion/integraciones");
  try {
    await auditar("actualizar", "regla_api_llamadas", { id, activa });
  } catch {
    // Ver nota arriba.
  }
  return { ok: true };
}

export async function eliminarReglaAction(id: string) {
  await eliminarReglaApiLlamadas(id);
  revalidatePath("/configuracion/integraciones");
  await auditar("eliminar", "regla_api_llamadas", { id });
}
