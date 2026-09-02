import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import { buildConnectionConfig } from "./connection-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// El .env vive en la raíz del monorepo (compartido por backend y voice-server),
// no en backend/, así que hay que apuntarle explícitamente.
config({ path: path.join(__dirname, "../../../.env") });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definido (revisa tu .env)");
  }

  const client = new pg.Client(buildConnectionConfig(connectionString));
  await client.connect();

  try {
    const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
    console.log("Aplicando schema.sql ...");
    await client.query(sql);
    console.log("Listo: schema aplicado.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error al migrar:", err);
  process.exit(1);
});
