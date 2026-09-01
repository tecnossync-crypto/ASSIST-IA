import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definido (revisa tu .env)");
}

export const pool = new pg.Pool({ connectionString });
