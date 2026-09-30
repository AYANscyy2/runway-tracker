"use server";

import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { opportunities, opportunityUrls, userOpportunityTracking, type NewOpportunity } from "@/db/schema";
import { auth } from "@/lib/auth";
import { STATUS_FOR_TYPE, type Status } from "@/lib/constants";
import { validateOpportunityInput } from "@/lib/validate";
import { run, type ActionResult } from "@/lib/action-result";
import { headers } from "next/headers";

export type OpportunityInput = {
  // Shared fields
  type: NewOpportunity["type"];
  name: string;
  source: string | null;
  deadline: string | null;
  // Per-user fields
  status: Status;
  referralContact: string | null;
  foundDate: string | null;
  followUpDate: string | null;
  nextAction: string | null;
  notes: string | null;
  // URLs (shared)
  urls: { label: string; url: string }[];
};


/** How long a deleted entry stays restorable before it is purged for good.
 * Comfortably longer than the Undo toast, so a slow click still works. */
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Opportunities are private; a row you don't own is indistinguishable from
 * one that doesn't exist — and so is one you deleted. */
async function requireOwned(id: number, userId: string, { deleted = false } = {}) {
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(and(
      eq(opportunities.id, id),
      eq(opportunities.createdBy, userId),
      deleted ? isNotNull(opportunities.deletedAt) : isNull(opportunities.deletedAt),
    ));
  if (!opp) throw new Error("Not found");
  return opp;
}

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("You're signed out — sign in again.");
  return session;
}

export async function createOpportunity(input: OpportunityInput): Promise<ActionResult> {
  return run(async () => {
    const session = await requireSession();
    const data = validateOpportunityInput(input, { partial: false }) as OpportunityInput;
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
        status,
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
  }, { revalidate: "/" });
}

export async function updateOpportunity(id: number, input: Partial<OpportunityInput>): Promise<ActionResult> {
  return run(async () => {
    const session = await requireSession();

    const opp = await requireOwned(id, session.user.id);

    const data = validateOpportunityInput(input, { partial: true, currentType: opp.type });
    const { urls, status, referralContact, foundDate, followUpDate, nextAction, notes, ...sharedData } = data;

    // Drizzle's own insert type, minus the columns this action never sets.
    const sharedUpdates: Partial<typeof opportunities.$inferInsert> = {};
    if (sharedData.type !== undefined) sharedUpdates.type = sharedData.type;
    if (sharedData.name !== undefined) sharedUpdates.name = sharedData.name;
    if (sharedData.source !== undefined) sharedUpdates.source = sharedData.source;
    if (sharedData.deadline !== undefined) sharedUpdates.deadline = sharedData.deadline;

    const [current] = await db
      .select({ status: userOpportunityTracking.status })
      .from(userOpportunityTracking)
      .where(and(eq(userOpportunityTracking.userId, session.user.id), eq(userOpportunityTracking.opportunityId, id)));

    // A type change that leaves the current status impossible (a hackathon in
    // "OA / Assignment") must come with a new status.
    if (sharedData.type !== undefined && status === undefined && current
      && !STATUS_FOR_TYPE[sharedData.type].includes(current.status)) {
      throw new Error(`Pick a status that exists for a ${sharedData.type}.`);
    }

    const trackingUpdates: Partial<typeof userOpportunityTracking.$inferInsert> = {};
    if (status !== undefined && status !== current?.status) {
      trackingUpdates.status = status;
      // Only a real status change restarts the "hasn't moved" clock.
      trackingUpdates.statusChangedAt = new Date();
    }
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
            status: status ?? "found",
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
  }, { revalidate: "/" });
}

/**
 * Delete, saved immediately. It is a soft delete so the Undo toast can bring
 * the entry back; waiting out the toast before deleting meant a reload inside
 * those seconds silently kept it. Entries past the undo window are purged
 * here, which is also when an Inbox posting promoted into one reopens for good.
 */
export async function deleteOpportunity(id: number): Promise<ActionResult> {
  return run(async () => {
    const session = await requireSession();

    await requireOwned(id, session.user.id);

    await db.update(opportunities).set({ deletedAt: new Date() }).where(eq(opportunities.id, id));

    await db
      .delete(opportunities)
      .where(and(
        eq(opportunities.createdBy, session.user.id),
        lt(opportunities.deletedAt, new Date(Date.now() - PURGE_AFTER_MS)),
      ));
  }, { revalidate: "/" });
}

/** Undo a delete. */
export async function restoreOpportunity(id: number): Promise<ActionResult> {
  return run(async () => {
    const session = await requireSession();

    await requireOwned(id, session.user.id, { deleted: true });

    await db.update(opportunities).set({ deletedAt: null }).where(eq(opportunities.id, id));
  }, { revalidate: "/" });
}
