import "dotenv/config";
import pg from "pg";
import { encriptar } from "../lib/crypto.js";

/**
 * Inserta (o actualiza) la primera empresa a partir de variables de entorno.
 * Uso real: completar TWILIO_* y SEED_EMPRESA_NOMBRE en .env, luego
 * `npm run seed`. El guion del agente y los números de transferencia se
 * pueden ajustar después directamente en la base, esto solo arranca el tenant.
 */

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está definido");

  const nombre = process.env.SEED_EMPRESA_NOMBRE;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!nombre || !accountSid || !authToken || !phoneNumber) {
    throw new Error(
      "Faltan variables: SEED_EMPRESA_NOMBRE, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER"
    );
  }

  const guionAgente = {
    saludo: process.env.SEED_GUION_SALUDO ?? `Gracias por llamar a ${nombre}, ¿en qué le puedo ayudar?`,
    que_resuelve: process.env.SEED_GUION_QUE_RESUELVE ?? "",
    datos_a_tomar: (process.env.SEED_GUION_DATOS_A_TOMAR ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    cuando_transferir: process.env.SEED_GUION_CUANDO_TRANSFERIR ?? "",
  };

  const numerosTransferencia = (process.env.SEED_NUMEROS_TRANSFERENCIA ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const authTokenEnc = encriptar(authToken);

    const result = await client.query(
      `INSERT INTO empresas (nombre, twilio_account_sid, twilio_auth_token_enc, twilio_phone_number, guion_agente, numeros_transferencia)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (twilio_phone_number) DO NOTHING
       RETURNING id`,
      [nombre, accountSid, authTokenEnc, phoneNumber, JSON.stringify(guionAgente), JSON.stringify(numerosTransferencia)]
    );

    if (result.rows.length > 0) {
      console.log(`Empresa creada: ${nombre} (id=${result.rows[0].id})`);
    } else {
      console.log(`Ya existía una empresa con ese número/nombre, no se insertó nada nuevo.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error en seed:", err);
  process.exit(1);
});
