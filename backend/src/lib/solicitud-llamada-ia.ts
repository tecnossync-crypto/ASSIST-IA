import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "./twilio-empresa.js";
import { asegurarContacto, upsertContacto } from "./contactos.js";
import { registrarWebhookRecibido } from "./webhooks-log.js";
import { evaluarReglaApiLlamadas, proximaOcurrencia } from "./reglas-api-llamadas.js";
import { primerIdentificador, resolverOperadorExterno } from "./operador-origen.js";
import { resolverDepartamento } from "./departamentos.js";
import { despacharColaIA, encolarLlamadaIA } from "./cola-salida-ia.js";
import { mapearPropietarioCliente } from "./propietario-cliente.js";
import { reintentosPorDefecto } from "./reintento-buzon.js";

/** true / "true" / 1 / "1" / "si" -> verdadero. */
function esVerdadero(v: unknown): boolean {
  return v === true || v === 1 || (typeof v === "string" && ["true", "1", "si", "sí", "yes"].includes(v.trim().toLowerCase()));
}

/** [60, 1440] o "60,1440" -> minutos válidos (1 min a 30 días), máximo 10; lo inválido se ignora. */
function listaDeMinutos(v: unknown): number[] {
  const crudo = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\s]+/) : [];
  return crudo
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 30 * 24 * 60)
    .map((n) => Math.floor(n))
    .slice(0, 10);
}

/** Primer texto no vacío de estos campos del cuerpo (acepta número; ignora objetos). */
function primerTexto(cuerpo: Record<string, unknown>, campos: string[], max = 200): string | null {
  for (const c of campos) {
    const v = cuerpo[c];
    if (typeof v === "string" || typeof v === "number") {
      const t = String(v).trim();
      if (t) return t.slice(0, max);
    }
  }
  return null;
}

/**
 * Guarda en Contactos lo que la plataforma mandó del cliente, ANTES de llamar: así la IA ya lo conoce (usa {{nombre}},
 * {{apellido}} y los campos personalizados en el guion) y el asesor lo ve en el panel. Campos: nombre (o
 * nombre_cliente / cliente_nombre / cliente / contacto_nombre), apellido, y `datos` = objeto con claves = api_name de
 * los campos personalizados de Configuración. Lo vacío no pisa lo que ya había.
 */
async function guardarDatosDelCliente(empresaId: string, numero: string, cuerpo: Record<string, unknown>): Promise<string[]> {
  const guardados: string[] = [];
  const nombre = primerTexto(cuerpo, ["nombre", "nombre_cliente", "cliente_nombre", "cliente", "contacto_nombre"]);
  if (nombre) {
    await upsertContacto(empresaId, numero, "nombre", nombre);
    guardados.push("nombre");
  }
  const apellido = primerTexto(cuerpo, ["apellido", "apellido_cliente"]);
  if (apellido) {
    await upsertContacto(empresaId, numero, "apellido", apellido);
    guardados.push("apellido");
  }
  const datos = cuerpo.datos;
  if (datos && typeof datos === "object" && !Array.isArray(datos)) {
    const r = await pool.query<{ campos: { nombre: string; api_name?: string }[] | null }>(
      "SELECT campos_personalizados AS campos FROM empresas WHERE id = $1",
      [empresaId]
    );
    const porApiName = new Map((r.rows[0]?.campos ?? []).filter((c) => c.api_name).map((c) => [c.api_name as string, c.nombre]));
    for (const [apiName, valor] of Object.entries(datos as Record<string, unknown>)) {
      const campo = porApiName.get(apiName);
      const texto = typeof valor === "string" || typeof valor === "number" ? String(valor).trim().slice(0, 500) : "";
      if (!campo || !texto) continue;
      await upsertContacto(empresaId, numero, campo, texto);
      guardados.push(apiName);
    }
  }
  return guardados;
}

/**
 * Datos de ESTA llamada para usar como {{variables}} en su prompt y para que la IA los tenga presentes: todo lo de
 * `variables` y `datos` (claves con letras, números o _), más nombre y apellido. A diferencia de Contactos, no se
 * guardan en el cliente: cada solicitud trae los suyos (ej. la aseguradora y el vencimiento de ESA renovación).
 */
function variablesDeLaLlamada(cuerpo: Record<string, unknown>): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const origen of [cuerpo.datos, cuerpo.variables]) {
    if (!origen || typeof origen !== "object" || Array.isArray(origen)) continue;
    for (const [clave, valor] of Object.entries(origen as Record<string, unknown>)) {
      if (Object.keys(resultado).length >= 40) break;
      if (!/^[a-zA-Z0-9_]{1,60}$/.test(clave)) continue;
      if (typeof valor !== "string" && typeof valor !== "number" && typeof valor !== "boolean") continue;
      const texto = String(valor).trim().slice(0, 500);
      if (texto) resultado[clave] = texto;
    }
  }
  const nombre = primerTexto(cuerpo, ["nombre", "nombre_cliente", "cliente_nombre", "cliente", "contacto_nombre"]);
  if (nombre && !resultado.nombre) resultado.nombre = nombre;
  const apellido = primerTexto(cuerpo, ["apellido", "apellido_cliente"]);
  if (apellido && !resultado.apellido) resultado.apellido = apellido;
  return resultado;
}

export interface ResultadoSolicitud {
  codigo: number;
  cuerpo: Record<string, unknown>;
}

/**
 * Una solicitud para que la plataforma llame con IA a un cliente (la manda un CRM por webhook, sola o dentro de un
 * lote). Valida, aplica la regla de API que corresponda, fija el departamento, evita duplicados y la deja en la cola
 * de salida; si hay línea libre y no hay fila esperando, la llamada sale al instante (igual que antes).
 *
 * Campos del cuerpo: numero (requerido), nombre, apellido, datos, prompt, origen, departamento | colaId, operador,
 * referencia, no_repetir_horas, fecha_programada | retraso_minutos.
 */
export async function procesarSolicitudLlamadaIA(args: {
  empresaId: string;
  cuerpo: Record<string, unknown>;
  esPrueba: boolean;
  /** Para lotes con espaciado: instante mínimo en que debe salir (se suma al horario que pida el propio item). */
  noAntesDe?: Date | null;
}): Promise<ResultadoSolicitud> {
  const { empresaId, cuerpo, esPrueba } = args;
  const registrar = (ok: boolean, error?: string, callSid?: string) =>
    registrarWebhookRecibido({ empresaId, endpoint: "llamadas", body: cuerpo, ok, error, esPrueba, callSid });
  const falla = async (codigo: number, error: string, extra: Record<string, unknown> = {}): Promise<ResultadoSolicitud> => {
    await registrar(false, error);
    return { codigo, cuerpo: { error, ...extra } };
  };

  const numero = cuerpo.numero;
  if (!numero || typeof numero !== "string" || !/^\+?[\d\s()-]{7,}$/.test(numero)) {
    return falla(400, "numero es requerido y debe ser un teléfono válido (ej. +18095551234)");
  }
  if (!process.env.PUBLIC_BASE_URL) return { codigo: 500, cuerpo: { error: "PUBLIC_BASE_URL no está configurado" } };

  // ── Hora opcional: fecha_programada (ISO con zona) o retraso_minutos. Si vienen las dos, manda fecha_programada.
  const fechaProgramada = cuerpo.fecha_programada;
  const retrasoRaw = cuerpo.retraso_minutos;
  let programadaPara: Date | null = null;
  const errorHora = (() => {
    if (fechaProgramada !== undefined && fechaProgramada !== null && fechaProgramada !== "") {
      if (typeof fechaProgramada !== "string" || !/(Z|[+-]\d{2}:?\d{2})$/i.test(fechaProgramada.trim())) {
        return "fecha_programada debe incluir la zona horaria (ej. 2026-10-10T15:00:00-04:00 o terminar en Z)";
      }
      const d = new Date(fechaProgramada.trim());
      if (Number.isNaN(d.getTime())) return "fecha_programada no es una fecha válida (formato ISO 8601)";
      if (d.getTime() - Date.now() > 90 * 24 * 60 * 60 * 1000) return "fecha_programada no puede ser a más de 90 días";
      programadaPara = d;
    } else if (retrasoRaw !== undefined && retrasoRaw !== null && retrasoRaw !== "") {
      const n = Number(retrasoRaw);
      if (!Number.isFinite(n) || n < 0) return "retraso_minutos debe ser un número de minutos (0 o más)";
      if (n > 90 * 24 * 60) return "retraso_minutos no puede ser a más de 90 días";
      programadaPara = new Date(Date.now() + Math.floor(n) * 60_000);
    }
    return null;
  })();
  if (errorHora) return falla(400, errorHora);

  const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
  if (!twilioEmpresa) return falla(400, "La empresa no tiene credenciales Twilio configuradas");

  // ── Regla de API: si alguna coincide, su guion manda sobre el "prompt" crudo que mandó la plataforma externa.
  const reglaAplicada = await evaluarReglaApiLlamadas(empresaId, cuerpo);
  const prompt = cuerpo.prompt;
  const promptCliente = typeof prompt === "string" && prompt.trim() ? prompt.trim().slice(0, 8000) : undefined;
  const promptFinal = reglaAplicada?.promptPersonalizado ?? promptCliente;

  // Si la solicitud no trae hora, la regla puede traer la suya (fecha fija, espera o "todos los días a las HH:MM").
  if (!programadaPara && reglaAplicada) {
    const fija = reglaAplicada.fechaProgramada;
    const espera = reglaAplicada.retrasoMinutos;
    if (reglaAplicada.horaDelDia && reglaAplicada.zonaHoraria) {
      programadaPara = await proximaOcurrencia(reglaAplicada.horaDelDia, reglaAplicada.zonaHoraria);
    } else if (fija && fija.getTime() - Date.now() > 60_000) {
      programadaPara = fija;
    } else if (espera && espera > 0) {
      programadaPara = new Date(Date.now() + espera * 60_000);
    }
  }
  // Lotes con espaciado: ninguna sale antes de su turno.
  if (args.noAntesDe && (!programadaPara || programadaPara < args.noAntesDe)) programadaPara = args.noAntesDe;
  const futura = programadaPara !== null && programadaPara.getTime() - Date.now() > 60_000;

  // ── Operador que la pidió, departamento fijo, referencia.
  // La plataforma que pide la llamada (su `origen`, ej. "zoho-salesiq" o "zoho-crm") decide en qué lista de ids se busca.
  const fuente = cuerpo.fuente ?? cuerpo.origen;
  const operadorRecibido = primerIdentificador(cuerpo, ["operador", "operador_id", "operador_email", "agente"]);
  const operadorUsuarioId = await resolverOperadorExterno(empresaId, operadorRecibido, fuente);
  const operadorExterno =
    operadorRecibido ? operadorRecibido.slice(0, 200) : null;

  const departamentoRecibido = cuerpo.departamento ?? cuerpo.colaId ?? cuerpo.cola_id ?? cuerpo.cola;
  const departamento = await resolverDepartamento(empresaId, departamentoRecibido);
  const departamentoTexto =
    typeof departamentoRecibido === "string" && departamentoRecibido.trim() ? departamentoRecibido.trim().slice(0, 200) : null;
  const infoDepartamento = departamentoTexto
    ? {
        departamento_encontrado: Boolean(departamento),
        ...(departamento
          ? { departamento_asignado: departamento.nombre }
          : { aviso: `El departamento "${departamentoTexto}" no coincide con ninguno de Configuración → Enrutamiento; la IA elegirá sola.` }),
      }
    : {};

  const referencia =
    typeof cuerpo.referencia === "string" || typeof cuerpo.referencia === "number"
      ? String(cuerpo.referencia).trim().slice(0, 200) || null
      : null;

  // ── Anti-duplicados: la misma referencia (ej. la misma cotización) no se llama dos veces dentro de la ventana, ni se
  // encolan dos llamadas al mismo número para la misma hora. Responde OK (es idempotente), sin llamar de nuevo.
  const horasNoRepetir = Number.isFinite(Number(cuerpo.no_repetir_horas)) ? Number(cuerpo.no_repetir_horas) : 24;
  if (referencia && horasNoRepetir > 0) {
    const dup = await pool.query<{ id: string }>(
      `SELECT w.id FROM llamadas_webhook w
       LEFT JOIN llamadas_programadas p ON p.llamada_webhook_id = w.id
       WHERE w.empresa_id = $1 AND w.referencia = $2 AND w.creado_en > now() - ($3 || ' hours')::interval
         AND (p.id IS NULL OR p.estado IN ('pendiente', 'completada'))
       LIMIT 1`,
      [empresaId, referencia, String(horasNoRepetir)]
    );
    if (dup.rows[0]) {
      await registrar(true, undefined);
      return {
        codigo: 200,
        cuerpo: { ok: true, duplicada: true, motivo: `Ya hay una llamada para la referencia "${referencia}" en las últimas ${horasNoRepetir} h; no se repite.`, id: dup.rows[0].id },
      };
    }
  }
  const cuando = programadaPara ?? new Date();
  const digitos = numero.replace(/\D/g, "").slice(-10);
  const pendiente = await pool.query<{ id: string }>(
    `SELECT p.id FROM llamadas_programadas p
     WHERE p.empresa_id = $1 AND p.estado = 'pendiente' AND right(regexp_replace(p.numero, '\\D', '', 'g'), 10) = $2
       AND p.fecha_programada BETWEEN $3::timestamptz - interval '1 hour' AND $3::timestamptz + interval '1 hour'
     LIMIT 1`,
    [empresaId, digitos, cuando.toISOString()]
  );
  if (pendiente.rows[0]) {
    await registrar(true, undefined);
    return {
      codigo: 200,
      cuerpo: { ok: true, duplicada: true, motivo: "Ya hay una llamada pendiente a ese número para esa hora; no se duplica." },
    };
  }

  // ── El cliente queda asignado a su propietario (lo que mandó el CRM) y, si hay transferencia a un asesor, le suena a él.
  await asegurarContacto(empresaId, numero);
  const datosGuardados = await guardarDatosDelCliente(empresaId, numero, cuerpo).catch(() => [] as string[]);
  const propietario = await mapearPropietarioCliente(empresaId, numero, cuerpo, operadorUsuarioId, fuente);

  // ── Reintento si cae en buzón de voz o no contestan (por defecto 1 vez, a los 20 min).
  const porDefecto = reintentosPorDefecto();
  const reintentosRaw = Number(cuerpo.reintentos_buzon);
  const minutosRaw = Number(cuerpo.minutos_reintento);
  // Seguimientos escalonados: `seguimientos` = minutos hasta cada nuevo intento (ej. [60, 1440, 4320]); manda sobre
  // reintentos_buzon / minutos_reintento.
  const seguimientos = listaDeMinutos(cuerpo.seguimientos ?? cuerpo.seguimiento_minutos);
  const reintentos = seguimientos.length
    ? seguimientos.length
    : cuerpo.reintentos_buzon !== undefined && cuerpo.reintentos_buzon !== "" && Number.isFinite(reintentosRaw)
      ? Math.max(0, Math.min(5, Math.floor(reintentosRaw)))
      : porDefecto.reintentos;
  const minutosReintento = seguimientos.length
    ? seguimientos[0]
    : cuerpo.minutos_reintento !== undefined && cuerpo.minutos_reintento !== "" && Number.isFinite(minutosRaw)
      ? Math.max(1, Math.min(1440, Math.floor(minutosRaw)))
      : porDefecto.minutos;

  // ── Se registra la solicitud y se encola.
  const solicitud = await pool.query<{ id: string }>(
    `INSERT INTO llamadas_webhook (empresa_id, numero, prompt, origen, regla_aplicada_id, programada_para,
                                   operador_usuario_id, operador_externo, cola_id, departamento_recibido, referencia,
                                   reintentos_restantes, minutos_reintento, usar_prompt_generico, variables,
                                   intervalos_reintento)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
    [
      empresaId,
      numero,
      promptFinal ?? null,
      typeof cuerpo.origen === "string" ? cuerpo.origen.slice(0, 200) : null,
      reglaAplicada?.reglaId ?? null,
      futura ? programadaPara : null,
      operadorUsuarioId ?? propietario.propietarioId,
      operadorExterno,
      departamento?.id ?? null,
      departamentoTexto,
      referencia,
      reintentos,
      minutosReintento,
      // Solo tiene sentido si la llamada trae su propio guion (si no, ya se usa el prompt general completo).
      Boolean(promptFinal) && (Boolean(reglaAplicada?.usarPromptGenerico) || esVerdadero(cuerpo.usar_prompt_generico)),
      JSON.stringify(variablesDeLaLlamada(cuerpo)),
      seguimientos.length ? seguimientos : null,
    ]
  );
  const llamadaWebhookId = solicitud.rows[0].id;

  const recibidoId = await registrar(true);
  if (recibidoId) await pool.query("UPDATE llamadas_webhook SET recibido_id = $2 WHERE id = $1", [llamadaWebhookId, recibidoId]);

  const colaId = await encolarLlamadaIA({ empresaId, numero, fecha: futura ? (programadaPara as Date) : undefined, llamadaWebhookId });
  const base = {
    id: llamadaWebhookId,
    regla_aplicada: reglaAplicada?.nombre ?? null,
    ...infoDepartamento,
    ...(operadorExterno ? { operador_identificado: Boolean(operadorUsuarioId) } : {}),
    ...(referencia ? { referencia } : {}),
    ...(datosGuardados.length > 0 ? { contacto_guardado: datosGuardados } : {}),
    variables_recibidas: Object.keys(variablesDeLaLlamada(cuerpo)),
    ...(propietario.recibido ? { propietario_identificado: Boolean(propietario.usuarioId) } : {}),
    ...(propietario.propietarioId ? { transferencia_a_propietario: true } : {}),
    reintentos_buzon: reintentos,
    ...(reintentos > 0 ? { minutos_reintento: minutosReintento } : {}),
    ...(seguimientos.length ? { seguimientos_minutos: seguimientos } : {}),
  };

  if (futura && programadaPara) {
    return { codigo: 200, cuerpo: { ok: true, programada: true, fecha_programada: programadaPara.toISOString(), ...base } };
  }

  // Sale ya si hay línea libre y es su turno; si no, queda en la cola y el despachador la saca.
  await despacharColaIA();
  const estado = await pool.query<{ estado: string; call_sid: string | null; error: string | null; posicion: string }>(
    `SELECT p.estado, p.call_sid, p.error,
            (SELECT COUNT(*) FROM llamadas_programadas x
             WHERE x.empresa_id = p.empresa_id AND x.estado = 'pendiente'
               AND (x.fecha_programada, x.creado_en) < (p.fecha_programada, p.creado_en)) AS posicion
     FROM llamadas_programadas p WHERE p.id = $1`,
    [colaId]
  );
  const fila = estado.rows[0];
  if (fila?.estado === "fallida") {
    return { codigo: 502, cuerpo: { error: "No se pudo originar la llamada", detalle: fila.error, ...base } };
  }
  if (fila?.estado === "completada" && fila.call_sid) {
    return { codigo: 200, cuerpo: { ok: true, callSid: fila.call_sid, ...base } };
  }
  return {
    codigo: 200,
    cuerpo: {
      ok: true,
      en_cola: true,
      posicion_en_cola: Number(fila?.posicion ?? 0) + 1,
      aviso: "La llamada quedó en la cola y saldrá en cuanto haya línea libre (y dentro del horario permitido, si lo configuraste).",
      ...base,
    },
  };
}
