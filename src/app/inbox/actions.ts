"use server";

import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { jobExtractions, jobPostings, type InboxCard, type JobPosting } from "@/db/schema";
import { auth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/action-result";
import { extractJobDescription } from "@/lib/inbox/extract";
import { FetchBlockedError, fetchJobDescription } from "@/lib/inbox/fetch-jd";

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

    await runExtraction(posting.id, rawText);
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

    await runExtraction(postingId, posting.rawText);
  });
}

/** Shared by ingest and retry. Never throws — it records the failure on the row
 * so the card can show it, which is the whole point of the 'extracting' write. */
async function runExtraction(postingId: number, rawText: string): Promise<void> {
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
      .select({ posting: jobPostings, extraction: jobExtractions })
      .from(jobPostings)
      .leftJoin(jobExtractions, eq(jobExtractions.postingId, jobPostings.id))
      .where(eq(jobPostings.userId, userId))
      .orderBy(desc(jobPostings.createdAt));

    return rows.map(({ posting, extraction }) => ({
      ...stripRawText(posting),
      extraction,
      score: null,
    }));
  });
}

/** rawText can be tens of kilobytes and the cards never render it; only Retry
 * needs it, and that runs server-side. */
function stripRawText(posting: JobPosting): JobPosting {
  return { ...posting, rawText: "" };
}
