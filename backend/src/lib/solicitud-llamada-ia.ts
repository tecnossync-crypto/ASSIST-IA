import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "./twilio-empresa.js";
import { asegurarContacto } from "./contactos.js";
import { registrarWebhookRecibido } from "./webhooks-log.js";
import { evaluarReglaApiLlamadas, proximaOcurrencia } from "./reglas-api-llamadas.js";
import { resolverOperadorExterno } from "./operador-origen.js";
import { resolverDepartamento } from "./departamentos.js";
import { despacharColaIA, encolarLlamadaIA } from "./cola-salida-ia.js";

export interface ResultadoSolicitud {
  codigo: number;
  cuerpo: Record<string, unknown>;
}

/**
 * Una solicitud para que la plataforma llame con IA a un cliente (la manda un CRM por webhook, sola o dentro de un
 * lote). Valida, aplica la regla de API que corresponda, fija el departamento, evita duplicados y la deja en la cola
 * de salida; si hay línea libre y no hay fila esperando, la llamada sale al instante (igual que antes).
 *
 * Campos del cuerpo: numero (requerido), prompt, origen, departamento | colaId, operador, referencia,
 * no_repetir_horas, fecha_programada | retraso_minutos.
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
  const operadorRecibido = cuerpo.operador ?? cuerpo.operador_id ?? cuerpo.operador_email ?? cuerpo.agente;
  const operadorUsuarioId = await resolverOperadorExterno(empresaId, operadorRecibido);
  const operadorExterno =
    typeof operadorRecibido === "string" && operadorRecibido.trim() ? operadorRecibido.trim().slice(0, 200) : null;

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

  // ── Se registra la solicitud y se encola.
  const solicitud = await pool.query<{ id: string }>(
    `INSERT INTO llamadas_webhook (empresa_id, numero, prompt, origen, regla_aplicada_id, programada_para,
                                   operador_usuario_id, operador_externo, cola_id, departamento_recibido, referencia)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      empresaId,
      numero,
      promptFinal ?? null,
      typeof cuerpo.origen === "string" ? cuerpo.origen.slice(0, 200) : null,
      reglaAplicada?.reglaId ?? null,
      futura ? programadaPara : null,
      operadorUsuarioId,
      operadorExterno,
      departamento?.id ?? null,
      departamentoTexto,
      referencia,
    ]
  );
  const llamadaWebhookId = solicitud.rows[0].id;
  await asegurarContacto(empresaId, numero);

  const recibidoId = await registrar(true);
  if (recibidoId) await pool.query("UPDATE llamadas_webhook SET recibido_id = $2 WHERE id = $1", [llamadaWebhookId, recibidoId]);

  const colaId = await encolarLlamadaIA({ empresaId, numero, fecha: futura ? (programadaPara as Date) : undefined, llamadaWebhookId });
  const base = {
    id: llamadaWebhookId,
    regla_aplicada: reglaAplicada?.nombre ?? null,
    ...infoDepartamento,
    ...(operadorExterno ? { operador_identificado: Boolean(operadorUsuarioId) } : {}),
    ...(referencia ? { referencia } : {}),
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
