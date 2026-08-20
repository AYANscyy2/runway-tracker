import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { opportunities, opportunityUrls, userOpportunityTracking } from "@/db/schema";
import { Dashboard } from "@/components/Dashboard";
import AuthButton from "@/components/AuthButton";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { OpportunityWithUrls } from "@/db/schema";

// Always read fresh from the DB — this is a personal tool, not a marketing
// page, so there's no benefit to caching a stale pipeline.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-6 py-4 rounded-lg max-w-md w-full mb-4">
            <h3 className="font-bold text-lg mb-1">Authentication Error</h3>
            <code className="block bg-black/20 p-2 rounded text-sm mb-3 font-mono">{error}</code>
            <p className="text-sm opacity-80">
              Please check your Vercel deployment logs for the exact cause of this error.
            </p>
          </div>
        )}
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Welcome to Runway</h2>
        <p className="text-gray-500 max-w-md dark:text-gray-400">Please sign in to view and manage your job applications and hackathons.</p>
        <div className="fixed bottom-6 right-6">
          <AuthButton />
        </div>
      </div>
    );
  }

  // Fetch all shared opportunities
  const allOpps = await db
    .select()
    .from(opportunities)
    .orderBy(desc(opportunities.createdAt));

  if (allOpps.length === 0) {
    return <Dashboard initialData={[]} />;
  }

  const oppIds = allOpps.map((o) => o.id);

  // Fetch current user's tracking data for all opportunities
  const trackingRows = await db
    .select()
    .from(userOpportunityTracking)
    .where(eq(userOpportunityTracking.userId, session.user.id));

  const trackingByOppId = trackingRows.reduce((acc, t) => {
    acc[t.opportunityId] = t;
    return acc;
  }, {} as Record<number, typeof trackingRows[0]>);

  // Fetch all URLs
  const urls = await db
    .select()
    .from(opportunityUrls)
    .where(inArray(opportunityUrls.opportunityId, oppIds));

  const urlsByOppId = urls.reduce((acc, url) => {
    if (!acc[url.opportunityId]) acc[url.opportunityId] = [];
    acc[url.opportunityId].push(url);
    return acc;
  }, {} as Record<number, typeof urls>);

  // Merge: shared opp + user tracking + urls
  const itemsWithUrls: OpportunityWithUrls[] = allOpps.map((opp) => {
    const tracking = trackingByOppId[opp.id];
    return {
      ...opp,
      status: tracking?.status ?? "found",
      foundDate: tracking?.foundDate ?? null,
      followUpDate: tracking?.followUpDate ?? null,
      referralContact: tracking?.referralContact ?? null,
      nextAction: tracking?.nextAction ?? null,
      notes: tracking?.notes ?? null,
      trackingId: tracking?.id ?? null,
      urls: urlsByOppId[opp.id] || [],
    };
  });

  return <Dashboard initialData={itemsWithUrls} />;
}
