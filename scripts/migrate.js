import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Database migration complete.");
} catch (err) {
  try { await client.query("ROLLBACK"); } catch { /* ignore */ }
  console.error("Migration failed; rolled back.");
  throw err;
} finally {
  client.release();
  await pool.end();
}
