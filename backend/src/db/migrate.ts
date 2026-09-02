import { readFileSync, readdirSync } from "node:fs";
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
    const existe = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'empresas'"
    );

    if (existe.rows.length === 0) {
      const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
      console.log("Base vacía: aplicando schema.sql ...");
      await client.query(sql);
      console.log("Schema base aplicado.");
    } else {
      console.log("Base ya inicializada, se omite schema.sql (solo migraciones incrementales).");
    }

    const migracionesDir = path.join(__dirname, "migrations");
    const archivos = readdirSync(migracionesDir).filter((f) => f.endsWith(".sql")).sort();

    for (const archivo of archivos) {
      console.log(`Aplicando migración ${archivo} ...`);
      const sql = readFileSync(path.join(migracionesDir, archivo), "utf-8");
      await client.query(sql);
    }

    console.log(`Listo: schema + ${archivos.length} migración(es) incremental(es) aplicadas.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error al migrar:", err);
  process.exit(1);
});
