import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and add your Postgres connection string (a free Neon/Supabase/Railway database works fine)."
  );
}

// `prepare: false` is required for connection poolers like Neon's pgbouncer mode / Supabase's pooler.
// `ssl: "require"` is set explicitly (Neon's own docs recommend this) rather than relying on
// the `sslmode=require` query param in the connection string being auto-parsed.
const client = postgres(connectionString, { prepare: false, ssl: "require" });

export const db = drizzle(client, { schema });
