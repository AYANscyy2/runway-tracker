// Applies a .sql file over Neon's WebSocket transport (:443), because
// drizzle-kit needs raw TCP on :5432 and plenty of networks block it.
// Usage:  npm run db:sql sql/001_inbox.sql
import { readFile } from "node:fs/promises";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });
if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run db:sql <file.sql>");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  // One transaction: a half-applied schema change is worse than none.
  await client.query("BEGIN");
  await client.query(await readFile(file, "utf8"));
  await client.query("COMMIT");
  console.log(`✓ applied ${file}`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`✗ ${file} rolled back: ${e.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
