import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { opportunities, opportunityUrls } from "@/db/schema";
import { Dashboard } from "@/components/Dashboard";

// Always read fresh from the DB — this is a personal tool, not a marketing
// page, so there's no benefit to caching a stale pipeline.
export const dynamic = "force-dynamic";

export default async function Home() {
  const items = await db.select().from(opportunities).orderBy(desc(opportunities.createdAt));

  if (items.length === 0) {
    return <Dashboard initialData={[]} />;
  }

  const urls = await db
    .select()
    .from(opportunityUrls)
    .where(inArray(opportunityUrls.opportunityId, items.map((i) => i.id)));

  const urlsByOppId = urls.reduce((acc, url) => {
    if (!acc[url.opportunityId]) acc[url.opportunityId] = [];
    acc[url.opportunityId].push(url);
    return acc;
  }, {} as Record<number, typeof urls>);

  const itemsWithUrls = items.map((item) => ({
    ...item,
    urls: urlsByOppId[item.id] || [],
  }));

  return <Dashboard initialData={itemsWithUrls} />;
}
