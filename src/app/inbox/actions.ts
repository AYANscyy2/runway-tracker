"use server";

import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import {
  jobExtractions,
  jobPostings,
  matchScores,
  userProfiles,
  opportunities,
  opportunityUrls,
  userOpportunityTracking,
  type InboxCard,
  type JobExtraction,
  type JobPosting,
  type UserProfile,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/action-result";
import { extractJobDescription } from "@/lib/inbox/extract";
import { FetchBlockedError, fetchJobDescription } from "@/lib/inbox/fetch-jd";
import { RUBRIC_VERSION, scoreMatch } from "@/lib/inbox/rubric";

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("You're signed out — sign in again.");
  return session.user.id;
}

/** Whitespace-normalised so a re-paste with different wrapping still matches. */
function hashContent(text: string): string {
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex");
}

export type IngestInput = { kind: "text"; text: string } | { kind: "url"; url: string };

/**
 * Ingest a posting. The row is written with status 'extracting' *before* the
 * model is called, so a timeout or crash leaves a visible failed card rather
 * than silently nothing. Returns the posting id immediately-consistent with
 * whatever state it reached.
 */
export async function ingestPosting(input: IngestInput): Promise<ActionResult<number>> {
  return run(async () => {
    const userId = await requireUserId();

    let rawText: string;
    let sourceUrl: string | null = null;

    if (input.kind === "url") {
      const url = input.url.trim();
      if (!/^https?:\/\//i.test(url)) throw new Error("That doesn't look like a URL. Paste the job description text instead.");
      sourceUrl = url;
      // Deliberately not caught: a blocked fetch must not create a row, because
      // there's no rawText for Retry to work against.
      const fetched = await fetchJobDescription(url);
      rawText = fetched.text;
    } else {
      rawText = input.text.trim();
      if (rawText.length < 100) throw new Error("That's too short to be a job description.");
    }

    const contentHash = hashContent(rawText);

    // Re-ingesting something already in the inbox reuses the row rather than
    // failing on the unique constraint or making a duplicate card.
    const [posting] = await db
      .insert(jobPostings)
      .values({ userId, sourceUrl, rawText, contentHash, status: "extracting" })
      .onConflictDoUpdate({
        target: [jobPostings.userId, jobPostings.contentHash],
        set: { status: "extracting", failureReason: null, sourceUrl, updatedAt: new Date() },
      })
      .returning();

    await runExtraction(posting.id, rawText, userId);
    return posting.id;
  });
}

/** Re-run extraction against the stored text. Never re-fetches the URL — the
 * fetch already succeeded once, and re-hitting a site that rate-limits is how
 * you get blocked for good. */
export async function retryExtraction(postingId: number): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserId();
    const [posting] = await db
      .select()
      .from(jobPostings)
      .where(and(eq(jobPostings.id, postingId), eq(jobPostings.userId, userId)));
    if (!posting) throw new Error("Not found");

    await db
      .update(jobPostings)
      .set({ status: "extracting", failureReason: null, updatedAt: new Date() })
      .where(eq(jobPostings.id, postingId));

    await runExtraction(postingId, posting.rawText, userId);
  });
}

/** Shared by ingest and retry. Never throws — it records the failure on the row
 * so the card can show it, which is the whole point of the 'extracting' write. */
async function runExtraction(postingId: number, rawText: string, userId: string): Promise<void> {
  try {
    const result = await extractJobDescription(rawText);
    const e = result.extraction;

    await db
      .insert(jobExtractions)
      .values({
        postingId,
        role: e.role,
        company: e.company,
        stack: e.stack,
        compMin: e.compMin,
        compMax: e.compMax,
        compCurrency: e.compCurrency,
        location: e.location,
        remote: e.remote,
        deadline: e.deadline,
        seniority: e.seniority,
        model: result.model,
        promptVersion: result.promptVersion,
        attemptCount: result.attemptCount,
        retriedRule: result.retriedRule,
        rawResponse: result.rawResponse,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      })
      .onConflictDoUpdate({
        target: jobExtractions.postingId,
        set: {
          role: e.role, company: e.company, stack: e.stack,
          compMin: e.compMin, compMax: e.compMax, compCurrency: e.compCurrency,
          location: e.location, remote: e.remote, deadline: e.deadline, seniority: e.seniority,
          model: result.model, promptVersion: result.promptVersion,
          attemptCount: result.attemptCount, retriedRule: result.retriedRule,
          rawResponse: result.rawResponse,
          inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        },
      });

    await db
      .update(jobPostings)
      .set({ status: "new", failureReason: null, updatedAt: new Date() })
      .where(eq(jobPostings.id, postingId));

    await scorePosting(postingId, userId);
  } catch (err) {
    const message = err instanceof FetchBlockedError || err instanceof Error
      ? err.message
      : "Extraction failed.";
    console.error(`[inbox] extraction failed for posting ${postingId}: ${message}`);
    await db
      .update(jobPostings)
      .set({ status: "failed", failureReason: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(jobPostings.id, postingId));
  }
}

/** The Inbox fetches its own data on mount — postings never travel through
 * page.tsx, so rawText stays out of the tracker payload entirely. */
export async function listPostings(): Promise<ActionResult<InboxCard[]>> {
  return run(async () => {
    const userId = await requireUserId();

    const rows = await db
      .select({ posting: jobPostings, extraction: jobExtractions, score: matchScores })
      .from(jobPostings)
      .leftJoin(jobExtractions, eq(jobExtractions.postingId, jobPostings.id))
      .leftJoin(
        matchScores,
        and(eq(matchScores.postingId, jobPostings.id), eq(matchScores.userId, userId)),
      )
      .where(eq(jobPostings.userId, userId))
      .orderBy(desc(jobPostings.createdAt));

    return rows.map(({ posting, extraction, score }) => ({
      ...stripRawText(posting),
      extraction,
      score,
    }));
  });
}

/** rawText can be tens of kilobytes and the cards never render it; only Retry
 * needs it, and that runs server-side. */
function stripRawText(posting: JobPosting): JobPosting {
  return { ...posting, rawText: "" };
}

/** Dismiss with a reason. Kept rather than deleted — "pay too low" from three
 * months ago is worth seeing when the same company posts again. */
export async function dismissPosting(postingId: number, reason: string): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserId();
    const updated = await db
      .update(jobPostings)
      .set({ status: "dismissed", dismissedReason: reason.trim() || null, updatedAt: new Date() })
      .where(and(eq(jobPostings.id, postingId), eq(jobPostings.userId, userId)))
      .returning({ id: jobPostings.id });
    if (updated.length === 0) throw new Error("Not found");
  });
}

/** Undo a dismissal — back into the open bucket. */
export async function restorePosting(postingId: number): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserId();
    const updated = await db
      .update(jobPostings)
      .set({ status: "new", dismissedReason: null, updatedAt: new Date() })
      .where(and(eq(jobPostings.id, postingId), eq(jobPostings.userId, userId)))
      .returning({ id: jobPostings.id });
    if (updated.length === 0) throw new Error("Not found");
  });
}

/**
 * Promote a posting into the tracker. The extracted fields are *snapshotted*
 * into the opportunity rather than joined live: once it's in your pipeline you
 * own it, and editing the name shouldn't be second-guessed by whatever the
 * model originally read. Returns the new opportunity id.
 */
export async function trackPosting(postingId: number): Promise<ActionResult<number>> {
  return run(async () => {
    const userId = await requireUserId();

    const [row] = await db
      .select({ posting: jobPostings, extraction: jobExtractions })
      .from(jobPostings)
      .leftJoin(jobExtractions, eq(jobExtractions.postingId, jobPostings.id))
      .where(and(eq(jobPostings.id, postingId), eq(jobPostings.userId, userId)));

    if (!row) throw new Error("Not found");
    if (row.posting.status === "promoted" && row.posting.promotedOpportunityId) {
      throw new Error("This is already in your tracker.");
    }

    const e = row.extraction;
    const name = e?.company?.trim() || e?.role?.trim() || "Untitled opportunity";

    const opportunityId = await db.transaction(async (tx) => {
      const [opp] = await tx
        .insert(opportunities)
        .values({
          createdBy: userId,
          type: "job",
          name,
          source: row.posting.sourceUrl ? hostOf(row.posting.sourceUrl) : "Inbox",
          deadline: e?.deadline ?? null,
          role: e?.role ?? null,
          stack: e?.stack ?? null,
          compMin: e?.compMin ?? null,
          compMax: e?.compMax ?? null,
          location: e?.location ?? null,
          remote: e?.remote ?? null,
        })
        .returning({ id: opportunities.id });

      await tx.insert(userOpportunityTracking).values({
        userId,
        opportunityId: opp.id,
        status: "found",
        foundDate: new Date().toISOString().slice(0, 10),
      });

      if (row.posting.sourceUrl) {
        await tx.insert(opportunityUrls).values({
          opportunityId: opp.id,
          label: "Posting",
          url: row.posting.sourceUrl,
        });
      }

      await tx
        .update(jobPostings)
        .set({ status: "promoted", promotedOpportunityId: opp.id, updatedAt: new Date() })
        .where(eq(jobPostings.id, postingId));

      return opp.id;
    });

    return opportunityId;
  }, { revalidate: "/" });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Inbox";
  }
}

export type ManualPostingInput = {
  role: string;
  company: string;
  stack: string[];
  compMin: number | null;
  compMax: number | null;
  compCurrency: string | null;
  location: string | null;
  remote: JobExtraction["remote"];
  deadline: string | null;
  seniority: string | null;
  sourceUrl: string | null;
  notes: string | null;
};

/**
 * Add a posting by hand. It lands in the same tables as a parsed one and is
 * scored by the same rubric — the only difference is `model: "manual"`, so a
 * bad score can always be traced back to whether a model was involved.
 */
export async function addManualPosting(input: ManualPostingInput): Promise<ActionResult<number>> {
  return run(async () => {
    const userId = await requireUserId();

    const company = input.company.trim();
    const role = input.role.trim();
    if (!company && !role) throw new Error("Give it at least a role or a company.");

    // The rubric's fit dimension reads text, and Retry needs something to work
    // against, so a hand-filled entry still gets a readable body.
    const rawText = [
      role && `Role: ${role}`,
      company && `Company: ${company}`,
      input.location && `Location: ${input.location}`,
      input.stack.length > 0 && `Technologies: ${input.stack.join(", ")}`,
      input.seniority && `Seniority: ${input.seniority}`,
      input.notes?.trim(),
    ].filter(Boolean).join("\n");

    const contentHash = hashContent(`manual:${userId}:${company}:${role}:${input.sourceUrl ?? ""}`);

    const postingId = await db.transaction(async (tx) => {
      const [posting] = await tx
        .insert(jobPostings)
        .values({ userId, sourceUrl: input.sourceUrl, rawText, contentHash, status: "new" })
        .onConflictDoUpdate({
          target: [jobPostings.userId, jobPostings.contentHash],
          set: { status: "new", rawText, sourceUrl: input.sourceUrl, failureReason: null, updatedAt: new Date() },
        })
        .returning({ id: jobPostings.id });

      const extraction = {
        postingId: posting.id,
        role: role || null,
        company: company || null,
        stack: input.stack,
        compMin: input.compMin,
        compMax: input.compMax,
        compCurrency: input.compCurrency?.trim().toUpperCase() || null,
        location: input.location?.trim() || null,
        remote: input.remote,
        deadline: input.deadline,
        seniority: input.seniority?.trim() || null,
        model: "manual",
        promptVersion: "n/a",
        attemptCount: 1,
        retriedRule: null,
        rawResponse: null,
        inputTokens: null,
        outputTokens: null,
      };

      await tx
        .insert(jobExtractions)
        .values(extraction)
        .onConflictDoUpdate({ target: jobExtractions.postingId, set: extraction });

      return posting.id;
    });

    await scorePosting(postingId, userId);
    return postingId;
  });
}

/* ────────────────────────────── Profile & scoring ────────────────────────── */

export async function getProfile(): Promise<ActionResult<UserProfile | null>> {
  return run(async () => {
    const userId = await requireUserId();
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile ?? null;
  });
}

export type ProfileInput = {
  stack: string[];
  targetCompMin: number | null;
  targetCompMax: number | null;
  compCurrency: string;
  preferredLocations: string[];
  remotePreference: UserProfile["remotePreference"];
  availableFrom: string | null;
  seniority: string | null;
  notes: string | null;
};

/** Saving the profile rescores every open posting — a score computed against
 * a stale profile is worse than no score, because it looks current. */
export async function saveProfile(input: ProfileInput): Promise<ActionResult<number>> {
  return run(async () => {
    const userId = await requireUserId();

    const values = {
      userId,
      stack: input.stack.map((s) => s.trim().toLowerCase()).filter(Boolean),
      targetCompMin: input.targetCompMin,
      targetCompMax: input.targetCompMax,
      compCurrency: input.compCurrency.trim().toUpperCase() || "INR",
      preferredLocations: input.preferredLocations.map((s) => s.trim()).filter(Boolean),
      remotePreference: input.remotePreference,
      availableFrom: input.availableFrom,
      seniority: input.seniority?.trim() || null,
      notes: input.notes?.trim() || null,
      updatedAt: new Date(),
    };

    await db
      .insert(userProfiles)
      .values(values)
      .onConflictDoUpdate({ target: userProfiles.userId, set: values });

    return rescoreAllFor(userId);
  });
}

/** Rescore every posting that still has a decision pending.
 * Deliberately not exported: every export of a "use server" module is a public
 * endpoint, and one taking a userId would let any caller act as another user. */
async function rescoreAllFor(uid: string): Promise<number> {
  const rows = await db
    .select({ id: jobPostings.id })
    .from(jobPostings)
    .where(and(eq(jobPostings.userId, uid), eq(jobPostings.status, "new")));

  let scored = 0;
  for (const row of rows) {
    if (await scorePosting(row.id, uid)) scored++;
  }
  return scored;
}

/** Score one posting against the user's profile. No profile means no score —
 * the badge is simply absent rather than showing a meaningless number. */
async function scorePosting(postingId: number, userId: string): Promise<boolean> {
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  if (!profile) return false;

  const [extraction] = await db.select().from(jobExtractions).where(eq(jobExtractions.postingId, postingId));
  if (!extraction) return false;

  try {
    const { total, breakdown } = await scoreMatch(extraction as JobExtraction, profile);
    const values = { postingId, userId, total, breakdown, rubricVersion: RUBRIC_VERSION, createdAt: new Date() };
    await db
      .insert(matchScores)
      .values(values)
      .onConflictDoUpdate({ target: [matchScores.postingId, matchScores.userId], set: values });
    return true;
  } catch (e) {
    console.error(`[inbox] scoring failed for posting ${postingId}:`, e instanceof Error ? e.message : e);
    return false;
  }
}
