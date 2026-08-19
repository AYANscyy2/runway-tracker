"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { opportunities, opportunityUrls, userOpportunityTracking, type NewOpportunity } from "@/db/schema";
import { auth } from "@/lib/auth";
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

export async function createOpportunity(data: OpportunityInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const { urls, status, referralContact, foundDate, followUpDate, nextAction, notes, ...sharedData } = data;

  // Insert shared opportunity
  const newOpp = await db.insert(opportunities).values(sharedData).returning();

  // Insert per-user tracking
  await db.insert(userOpportunityTracking).values({
    userId: session.user.id,
    opportunityId: newOpp[0].id,
    status: status as any,
    referralContact,
    foundDate,
    followUpDate,
    nextAction,
    notes,
  });

  // Insert URLs
  if (urls.length > 0) {
    await db.insert(opportunityUrls).values(
      urls.map((u) => ({
        opportunityId: newOpp[0].id,
        label: u.label,
        url: u.url,
      }))
    );
  }
  revalidatePath("/");
}

export async function updateOpportunity(id: number, data: Partial<OpportunityInput>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const opp = await db.select().from(opportunities).where(eq(opportunities.id, id));
  if (!opp.length) {
    throw new Error("Not found");
  }

  const { urls, status, referralContact, foundDate, followUpDate, nextAction, notes, ...sharedData } = data;

  // Update shared fields
  const sharedUpdates: Record<string, any> = {};
  if (sharedData.type !== undefined) sharedUpdates.type = sharedData.type;
  if (sharedData.name !== undefined) sharedUpdates.name = sharedData.name;
  if (sharedData.source !== undefined) sharedUpdates.source = sharedData.source;
  if (sharedData.deadline !== undefined) sharedUpdates.deadline = sharedData.deadline;

  if (Object.keys(sharedUpdates).length > 0) {
    sharedUpdates.updatedAt = new Date();
    await db.update(opportunities).set(sharedUpdates).where(eq(opportunities.id, id));
  }

  // Upsert per-user tracking fields
  const trackingUpdates: Record<string, any> = {};
  if (status !== undefined) trackingUpdates.status = status;
  if (referralContact !== undefined) trackingUpdates.referralContact = referralContact;
  if (foundDate !== undefined) trackingUpdates.foundDate = foundDate;
  if (followUpDate !== undefined) trackingUpdates.followUpDate = followUpDate;
  if (nextAction !== undefined) trackingUpdates.nextAction = nextAction;
  if (notes !== undefined) trackingUpdates.notes = notes;

  if (Object.keys(trackingUpdates).length > 0) {
    trackingUpdates.updatedAt = new Date();

    // Try to find existing tracking row
    const existing = await db
      .select()
      .from(userOpportunityTracking)
      .where(eq(userOpportunityTracking.opportunityId, id))
      .then((rows) => rows.filter((r) => r.userId === session.user.id));

    if (existing.length > 0) {
      await db
        .update(userOpportunityTracking)
        .set(trackingUpdates)
        .where(eq(userOpportunityTracking.id, existing[0].id));
    } else {
      // Create tracking row for this user
      await db.insert(userOpportunityTracking).values({
        userId: session.user.id,
        opportunityId: id,
        status: (status as any) ?? "found",
        referralContact: referralContact ?? null,
        foundDate: foundDate ?? null,
        followUpDate: followUpDate ?? null,
        nextAction: nextAction ?? null,
        notes: notes ?? null,
      });
    }
  }

  // Update URLs (shared)
  if (urls !== undefined) {
    await db.delete(opportunityUrls).where(eq(opportunityUrls.opportunityId, id));
    if (urls.length > 0) {
      await db.insert(opportunityUrls).values(
        urls.map((u) => ({
          opportunityId: id,
          label: u.label,
          url: u.url,
        }))
      );
    }
  }
  revalidatePath("/");
}

export async function deleteOpportunity(id: number) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const opp = await db.select().from(opportunities).where(eq(opportunities.id, id));
  if (!opp.length) {
    throw new Error("Not found");
  }

  await db.delete(opportunities).where(eq(opportunities.id, id));
  revalidatePath("/");
}
