import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definido (revisa tu .env)");
  }

  const client = new pg.Client({ connectionString });
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
