import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and add your Postgres connection string (a free Neon/Supabase/Railway database works fine)."
  );
}

// Neon's driver tunnels Postgres over a WebSocket on :443 instead of a raw
// TCP connection on :5432, which many restricted networks (campus/office wifi)
// block outright. Node 22+ has a global WebSocket; older runtimes would need
// the `ws` package.
if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

// The WebSocket transport (as opposed to Neon's HTTP one) keeps a real session
// open, so interactive transactions in actions.ts still work.
const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
