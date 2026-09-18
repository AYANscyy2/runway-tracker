"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { opportunities, opportunityUrls, userOpportunityTracking, type NewOpportunity } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canDeleteOpportunity } from "@/lib/permissions";
import { headers } from "next/headers";

export type OpportunityInput = {
  // Shared fields
  type: NewOpportunity["type"];
  name: string;
  source: string | null;
  deadline: string | null;
  // Per-user fields
  status: string;
  referralContact: string | null;
  foundDate: string | null;
  followUpDate: string | null;
  nextAction: string | null;
  notes: string | null;
  // URLs (shared)
  urls: { label: string; url: string }[];
};

export type ActionResult = { ok: true } | { ok: false; error: string };

// Server action errors are masked in production, so we return them as data
// and let the client show a toast instead of throwing.
async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("You're signed out — sign in again.");
  return session;
}

export async function createOpportunity(data: OpportunityInput): Promise<ActionResult> {
  return run(async () => {
    const session = await requireSession();
    const { urls, status, referralContact, foundDate, followUpDate, nextAction, notes, ...sharedData } = data;

    // One transaction: a failed URL insert must not leave an orphaned opportunity.
    await db.transaction(async (tx) => {
      const [newOpp] = await tx
        .insert(opportunities)
        .values({ ...sharedData, createdBy: session.user.id })
        .returning();

      await tx.insert(userOpportunityTracking).values({
        userId: session.user.id,
        opportunityId: newOpp.id,
        status: status as any,
        referralContact,
        foundDate,
        followUpDate,
        nextAction,
        notes,
      });

      if (urls.length > 0) {
        await tx.insert(opportunityUrls).values(
          urls.map((u) => ({ opportunityId: newOpp.id, label: u.label, url: u.url })),
        );
      }
    });
  });
}

export async function updateOpportunity(id: number, data: Partial<OpportunityInput>): Promise<ActionResult> {
  return run(async () => {
    const session = await requireSession();

    const opp = await db.select().from(opportunities).where(eq(opportunities.id, id));
    if (!opp.length) {
      throw new Error("Not found");
    }

    const { urls, status, referralContact, foundDate, followUpDate, nextAction, notes, ...sharedData } = data;

    const sharedUpdates: Record<string, any> = {};
    if (sharedData.type !== undefined) sharedUpdates.type = sharedData.type;
    if (sharedData.name !== undefined) sharedUpdates.name = sharedData.name;
    if (sharedData.source !== undefined) sharedUpdates.source = sharedData.source;
    if (sharedData.deadline !== undefined) sharedUpdates.deadline = sharedData.deadline;

    const trackingUpdates: Record<string, any> = {};
    if (status !== undefined) trackingUpdates.status = status;
    if (referralContact !== undefined) trackingUpdates.referralContact = referralContact;
    if (foundDate !== undefined) trackingUpdates.foundDate = foundDate;
    if (followUpDate !== undefined) trackingUpdates.followUpDate = followUpDate;
    if (nextAction !== undefined) trackingUpdates.nextAction = nextAction;
    if (notes !== undefined) trackingUpdates.notes = notes;

    await db.transaction(async (tx) => {
      if (Object.keys(sharedUpdates).length > 0) {
        sharedUpdates.updatedAt = new Date();
        await tx.update(opportunities).set(sharedUpdates).where(eq(opportunities.id, id));
      }

      // Per-user tracking: the (userId, opportunityId) unique constraint lets
      // this be a single upsert instead of select-then-branch.
      if (Object.keys(trackingUpdates).length > 0) {
        trackingUpdates.updatedAt = new Date();
        await tx
          .insert(userOpportunityTracking)
          .values({
            userId: session.user.id,
            opportunityId: id,
            status: (status as any) ?? "found",
            referralContact: referralContact ?? null,
            foundDate: foundDate ?? null,
            followUpDate: followUpDate ?? null,
            nextAction: nextAction ?? null,
            notes: notes ?? null,
          })
          .onConflictDoUpdate({
            target: [userOpportunityTracking.userId, userOpportunityTracking.opportunityId],
            set: trackingUpdates,
          });
      }

      if (urls !== undefined) {
        await tx.delete(opportunityUrls).where(eq(opportunityUrls.opportunityId, id));
        if (urls.length > 0) {
          await tx.insert(opportunityUrls).values(
            urls.map((u) => ({ opportunityId: id, label: u.label, url: u.url })),
          );
        }
      }
    });
  });
}

export async function deleteOpportunity(id: number): Promise<ActionResult> {
  return run(async () => {
    const session = await requireSession();

    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    if (!opp) {
      throw new Error("Not found");
    }

    const [other] = await db
      .select({ id: userOpportunityTracking.id })
      .from(userOpportunityTracking)
      .where(and(eq(userOpportunityTracking.opportunityId, id), ne(userOpportunityTracking.userId, session.user.id)))
      .limit(1);

    if (!canDeleteOpportunity(opp.createdBy, session.user.id, other !== undefined)) {
      throw new Error("Only the person who logged this can delete it.");
    }

    await db.delete(opportunities).where(eq(opportunities.id, id));
  });
}
