import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "./twilio-empresa.js";
import { extensionesDeTransferencia } from "./enrutamiento.js";
import { twimlTransferirCentralPropia } from "./twiml.js";

/**
 * TwiML para pasar una llamada a las extensiones de la central (teléfonos
 * físicos), o null si no se puede: central apagada para entrantes, sin dominio
 * o sin extensiones activas. Lo usan la transferencia directa (post-relay) y el
 * respaldo cuando los asesores de la plataforma no contestan.
 */
export async function twimlParaCentral(opts: {
  empresaId: string;
  colaId: string | null;
  callSid: string;
  publicBaseUrl: string;
  grabar?: boolean;
}): Promise<{ twiml: string; extensiones: string[] } | { motivo: "central_apagada" | "sin_extensiones" }> {
  const { empresaId, colaId, callSid, publicBaseUrl, grabar = false } = opts;
  const twilioEmpresa = await clienteTwilioEmpresa(empresaId);
  const central = twilioEmpresa?.centralPropia;
  if (!central?.entrante) return { motivo: "central_apagada" };

  const extensiones = await extensionesDeTransferencia(empresaId, colaId);
  if (extensiones.length === 0) return { motivo: "sin_extensiones" };

  // Con autenticación por IP, "usuario/password" no son credenciales SIP (la
  // contraseña guardada ahí es el PIN del DISA) — no se mandan.
  const conCredenciales = central.authTipo === "credenciales";
  return {
    extensiones,
    twiml: twimlTransferirCentralPropia({
      extensiones,
      dominio: central.dominio,
      usuario: conCredenciales ? central.usuario : null,
      password: conCredenciales ? central.password : null,
      publicBaseUrl,
      callSid,
      grabar,
    }),
  };
}

/** Programa el respaldo: si en `segundos` nadie de la plataforma contestó, pasa a la central. */
export async function programarRespaldoCentral(llamadaId: string, segundos: number): Promise<void> {
  await pool.query("UPDATE llamadas SET respaldo_central_en = now() + ($2 || ' seconds')::interval WHERE id = $1", [
    llamadaId,
    String(Math.max(5, Math.floor(segundos))),
  ]);
}

/**
 * Pasa a la central las llamadas cuyo respaldo ya venció y siguen sin asesor.
 * Corre en el despachador. Si la central no está lista, la llamada simplemente
 * sigue esperando (cola) — no se corta.
 */
export async function ejecutarRespaldosCentralVencidos(publicBaseUrl: string): Promise<number> {
  const vencidas = await pool.query<{
    id: string;
    empresa_id: string;
    cola_id: string | null;
    call_sid: string;
    agentes_call_sids: string[];
  }>(
    `UPDATE llamadas SET respaldo_central_en = NULL
     WHERE respaldo_central_en IS NOT NULL
       AND respaldo_central_en <= now()
       AND agente_call_sid IS NULL
       AND estado IN ('en_curso', 'transferida')
     RETURNING id, empresa_id, cola_id, call_sid, agentes_call_sids`
  );

  let pasadas = 0;
  for (const l of vencidas.rows) {
    try {
      const resultado = await twimlParaCentral({
        empresaId: l.empresa_id,
        colaId: l.cola_id,
        callSid: l.call_sid,
        publicBaseUrl,
        grabar: false, // ya viene grabándose desde la IA
      });
      if (!("twiml" in resultado)) {
        console.warn(`[respaldo-central] llamada ${l.call_sid}: la central no está lista (${resultado.motivo}), sigue esperando`);
        continue;
      }

      const twilioEmpresa = await clienteTwilioEmpresa(l.empresa_id);
      if (!twilioEmpresa) continue;

      // Deja de timbrar a los asesores de la plataforma y manda al cliente a la central.
      await Promise.all(
        (l.agentes_call_sids ?? []).map((sid) =>
          twilioEmpresa.client
            .calls(sid)
            .update({ status: "completed" })
            .catch(() => {})
        )
      );
      await pool.query("UPDATE llamadas SET en_cola_desde = NULL WHERE id = $1", [l.id]);
      await twilioEmpresa.client.calls(l.call_sid).update({ twiml: resultado.twiml });
      console.log(
        `[respaldo-central] nadie contestó en la plataforma: llamada ${l.call_sid} pasada a las extensiones ${resultado.extensiones.join(", ")}`
      );
      pasadas++;
    } catch (err) {
      console.error(`[respaldo-central] no se pudo pasar la llamada ${l.call_sid} a la central:`, err);
    }
  }
  return pasadas;
}
