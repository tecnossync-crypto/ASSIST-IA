import pg from "pg";
import { buildConnectionConfig } from "./connection-config.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definido (revisa tu .env)");
}

export const pool = new pg.Pool(buildConnectionConfig(connectionString));
