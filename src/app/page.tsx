import { desc } from "drizzle-orm";
import { db } from "@/db";
import { opportunities } from "@/db/schema";
import { Dashboard } from "@/components/Dashboard";

// Always read fresh from the DB — this is a personal tool, not a marketing
// page, so there's no benefit to caching a stale pipeline.
export const dynamic = "force-dynamic";

export default async function Home() {
  const items = await db.select().from(opportunities).orderBy(desc(opportunities.createdAt));

  return <Dashboard initialData={items} />;
}
