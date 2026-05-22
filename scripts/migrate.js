import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");

try {
  await pool.query(sql);
  console.log("Database migration complete.");
} finally {
  await pool.end();
}
