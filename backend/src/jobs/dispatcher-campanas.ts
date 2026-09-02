import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa } from "../lib/twilio-empresa.js";

// Cuántos contactos se marcan "listos para llamar" por cada tick. Es el
// control de ritmo: con TICK_MS=20s y LOTE=3, salen ~9 llamadas/minuto por
// todo el sistema — ajustable según lo que tolere la cuenta de Twilio.
const LOTE_POR_TICK = Number(process.env.CAMPANAS_LOTE_POR_TICK ?? 3);

/**
 * Un ciclo del despachador: toma contactos pendientes de campañas en_curso
 * (respetando proximo_intento_en) y origina la llamada. Se llama desde un
 * setInterval en server.ts — no es un proceso separado, corre dentro del
 * mismo backend para no complicar el despliegue en esta fase.
 */
export async function procesarTickCampanas(publicBaseUrl: string) {
  const pendientes = await pool.query<{
    id: string;
    campana_id: string;
    empresa_id: string;
    numero: string;
  }>(
    `SELECT cc.id, cc.campana_id, cc.empresa_id, cc.numero
     FROM campana_contactos cc
     JOIN campanas c ON c.id = cc.campana_id
     WHERE c.estado = 'en_curso'
       AND cc.estado = 'pendiente'
       AND cc.proximo_intento_en <= now()
     ORDER BY cc.proximo_intento_en
     LIMIT $1`,
    [LOTE_POR_TICK]
  );

  for (const contacto of pendientes.rows) {
    await originarLlamadaContacto(contacto, publicBaseUrl);
  }
}

async function originarLlamadaContacto(
  contacto: { id: string; campana_id: string; empresa_id: string; numero: string },
  publicBaseUrl: string
) {
  // Marca "llamando" ya mismo para que el próximo tick no la vuelva a tomar.
  await pool.query(
    `UPDATE campana_contactos SET estado = 'llamando', intentos = intentos + 1 WHERE id = $1`,
    [contacto.id]
  );

  const twilioEmpresa = await clienteTwilioEmpresa(contacto.empresa_id);
  if (!twilioEmpresa) {
    await pool.query(`UPDATE campana_contactos SET estado = 'fallida' WHERE id = $1`, [contacto.id]);
    console.error(`[campaña] empresa ${contacto.empresa_id} sin credenciales Twilio, contacto ${contacto.id} marcado fallido`);
    return;
  }

  try {
    await twilioEmpresa.client.calls.create({
      to: contacto.numero,
      from: twilioEmpresa.fromNumber,
      url: `${publicBaseUrl}/webhooks/twilio/voice-outbound?empresaId=${contacto.empresa_id}&campanaContactoId=${contacto.id}`,
      method: "POST",
      statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status?campanaContactoId=${contacto.id}`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["completed"],
      timeout: twilioEmpresa.timeoutTimbrado,
    });
  } catch (err) {
    console.error(`[campaña] error originando llamada a ${contacto.numero}:`, err);
    await reprogramarOFallar(contacto.id, contacto.campana_id);
  }
}

/**
 * Se llama tanto si Twilio rechaza la llamada al originarla, como desde el
 * webhook de call-status cuando el resultado final no fue "completed"
 * (no contestó, ocupado, falló). Si quedan reintentos, reprograma; si no,
 * la marca fallida definitivamente.
 */
export async function reprogramarOFallar(contactoId: string, campanaId: string) {
  const campana = await pool.query<{ reintentos_max: number; horas_entre_reintentos: number }>(
    "SELECT reintentos_max, horas_entre_reintentos FROM campanas WHERE id = $1",
    [campanaId]
  );
  const config = campana.rows[0];

  const contacto = await pool.query<{ intentos: number }>(
    "SELECT intentos FROM campana_contactos WHERE id = $1",
    [contactoId]
  );
  const intentos = contacto.rows[0]?.intentos ?? 0;

  if (config && intentos < config.reintentos_max) {
    await pool.query(
      `UPDATE campana_contactos
       SET estado = 'pendiente', proximo_intento_en = now() + ($2 || ' hours')::interval
       WHERE id = $1`,
      [contactoId, config.horas_entre_reintentos]
    );
  } else {
    await pool.query(`UPDATE campana_contactos SET estado = 'fallida' WHERE id = $1`, [contactoId]);
  }
}
