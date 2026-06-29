// Applies SQL files from ./drizzle (created by `npm run db:generate`) directly,
// without the interactive confirmation prompt that `drizzle-kit push` needs on
// a fresh database. Safe to run multiple times — already-applied migrations
// are tracked and skipped.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set — check .env.local");
  process.exit(1);
}

const client = postgres(connectionString, { ssl: "require", max: 1 });
const db = drizzle(client);

console.log("Applying migrations from ./drizzle ...");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Done — schema is up to date.");

await client.end();
