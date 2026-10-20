import { pool } from "../db/pool.js";
import { clienteTwilioEmpresa, resolverDestinoSaliente } from "../lib/twilio-empresa.js";
import { registrarFallbackCentral } from "../lib/fallback-central.js";

// Cuántos contactos se marcan "listos para llamar" por cada tick. Es el
// control de ritmo: con TICK_MS=20s y LOTE=3, salen ~9 llamadas/minuto por
// todo el sistema — ajustable según lo que tolere la cuenta de Twilio.
const LOTE_POR_TICK = Number(process.env.CAMPANAS_LOTE_POR_TICK ?? 3);

// Tope de llamadas de campaña en curso AL MISMO TIEMPO (todas las campañas juntas). Sin esto, el ritmo de arriba
// con llamadas de varios minutos satura las líneas (la central / el troncal tiene un número limitado de canales)
// y las llamadas empiezan a salir ocupadas. Subirlo solo si la central y Twilio aguantan más.
const MAX_SIMULTANEAS = Number(process.env.CAMPANAS_MAX_SIMULTANEAS ?? 10);

// Un contacto "llamando" más de este tiempo se da por perdido (el callback de Twilio nunca llegó, o el servidor se
// reinició a mitad): se reprograma o se marca fallido en vez de quedar atascado y ocupar un lugar para siempre.
const MINUTOS_MAX_LLAMANDO = Number(process.env.CAMPANAS_MINUTOS_MAX_LLAMANDO ?? 30);

/**
 * Un ciclo del despachador: toma contactos pendientes de campañas en_curso
 * (respetando proximo_intento_en) y origina la llamada. Se llama desde un
 * setInterval en server.ts — no es un proceso separado, corre dentro del
 * mismo backend para no complicar el despliegue en esta fase.
 */
export async function procesarTickCampanas(publicBaseUrl: string) {
  // Promueve a "en_curso" las campañas programadas cuya hora ya llegó.
  await pool.query(
    `UPDATE campanas SET estado = 'en_curso'
     WHERE estado = 'borrador' AND programada_para IS NOT NULL AND programada_para <= now()`
  );

  await recuperarContactosAtascados();
  await completarCampanasTerminadas();

  // Cuántas llamadas hay en el aire ahora: solo se origina lo que quepa bajo el tope.
  const enAire = await pool.query<{ n: string }>(`SELECT COUNT(*) AS n FROM campana_contactos WHERE estado = 'llamando'`);
  const cupo = MAX_SIMULTANEAS - Number(enAire.rows[0].n);
  if (cupo <= 0) return;

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
       AND cc.es_prueba = false
       AND cc.proximo_intento_en <= now()
     ORDER BY cc.proximo_intento_en
     LIMIT $1`,
    [Math.min(LOTE_POR_TICK, cupo)]
  );

  for (const contacto of pendientes.rows) {
    await originarLlamadaContacto(contacto, publicBaseUrl);
  }
}

/** Contactos que llevan demasiado "llamando": se reprograman o se marcan fallidos. */
async function recuperarContactosAtascados() {
  const atascados = await pool.query<{ id: string; campana_id: string }>(
    `SELECT id, campana_id FROM campana_contactos
     WHERE estado = 'llamando' AND llamando_desde IS NOT NULL
       AND llamando_desde < now() - ($1 || ' minutes')::interval`,
    [String(MINUTOS_MAX_LLAMANDO)]
  );
  for (const c of atascados.rows) {
    console.warn(`[campaña] contacto ${c.id} llevaba más de ${MINUTOS_MAX_LLAMANDO} min "llamando": se recupera`);
    await reprogramarOFallar(c.id, c.campana_id);
  }
}

/** Una campaña en curso sin contactos pendientes ni en llamada ya terminó. */
async function completarCampanasTerminadas() {
  await pool.query(
    `UPDATE campanas c SET estado = 'completada'
     WHERE c.estado = 'en_curso'
       AND EXISTS (SELECT 1 FROM campana_contactos x WHERE x.campana_id = c.id AND x.es_prueba = false)
       AND NOT EXISTS (
         SELECT 1 FROM campana_contactos x
         WHERE x.campana_id = c.id AND x.es_prueba = false AND x.estado IN ('pendiente', 'llamando')
       )`
  );
}

async function originarLlamadaContacto(
  contacto: { id: string; campana_id: string; empresa_id: string; numero: string },
  publicBaseUrl: string
) {
  // Marca "llamando" ya mismo para que el próximo tick no la vuelva a tomar. Es atómico: si otro tick ya se llevó
  // este contacto (ticks que se solapan), este no lo llama dos veces.
  const tomado = await pool.query(
    `UPDATE campana_contactos
     SET estado = 'llamando', intentos = intentos + 1, llamando_desde = now()
     WHERE id = $1 AND estado = 'pendiente'
     RETURNING id`,
    [contacto.id]
  );
  if (tomado.rows.length === 0) return;

  const twilioEmpresa = await clienteTwilioEmpresa(contacto.empresa_id);
  if (!twilioEmpresa) {
    await pool.query(`UPDATE campana_contactos SET estado = 'fallida' WHERE id = $1`, [contacto.id]);
    console.error(`[campaña] empresa ${contacto.empresa_id} sin credenciales Twilio, contacto ${contacto.id} marcado fallido`);
    return;
  }

  try {
    const { to, sendDigits, urlExtra, porCentralPropia } = resolverDestinoSaliente(
      contacto.numero,
      twilioEmpresa.centralPropia
    );
    const llamadaCampana = await twilioEmpresa.client.calls.create({
      to,
      from: twilioEmpresa.fromNumber,
      url: `${publicBaseUrl}/webhooks/twilio/voice-outbound?empresaId=${contacto.empresa_id}&campanaContactoId=${contacto.id}${urlExtra}`,
      method: "POST",
      statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status?campanaContactoId=${contacto.id}`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["completed"],
      timeout: twilioEmpresa.timeoutTimbrado,
      sendDigits,
    });
    registrarFallbackCentral(llamadaCampana.sid, porCentralPropia, {
      empresaId: contacto.empresa_id,
      numero: contacto.numero,
      voiceUrl: `${publicBaseUrl}/webhooks/twilio/voice-outbound?empresaId=${contacto.empresa_id}&campanaContactoId=${contacto.id}`,
      statusCallback: `${publicBaseUrl}/webhooks/twilio/call-status?campanaContactoId=${contacto.id}`,
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

  const contacto = await pool.query<{ intentos: number; es_prueba: boolean }>(
    "SELECT intentos, es_prueba FROM campana_contactos WHERE id = $1",
    [contactoId]
  );
  const intentos = contacto.rows[0]?.intentos ?? 0;

  // "Reintentos máximos" = veces que se vuelve a llamar DESPUÉS del primer intento (así lo dice la pantalla de la
  // campaña). Antes se comparaba sin contar el primer intento y con 2 reintentos solo se reintentaba una vez.
  // Las llamadas de prueba nunca se reintentan solas.
  if (config && !contacto.rows[0]?.es_prueba && intentos <= config.reintentos_max) {
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
