"use server";

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  jobChunks,
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
  type MatchScore,
  type UserProfile,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/action-result";
import { extractJobDescription, type ExtractionHints } from "@/lib/inbox/extract";
import { FetchBlockedError, fetchJobDescription } from "@/lib/inbox/fetch-jd";
import { RUBRIC_VERSION, scoreCard, scoreMatch } from "@/lib/inbox/rubric";
import { STUCK_AFTER_MS } from "@/lib/inbox/constants";
import { chunkJobDescription, embeddableText } from "@/lib/inbox/chunk";
import { embedTexts } from "@/lib/inbox/embed";
import { hybridSearch, type SearchHit } from "@/lib/inbox/search";
import { checkExtraction, normalizeExtraction } from "@/lib/inbox/validate";
import type { Extraction } from "@/lib/inbox/schema";
import { canonicalUrl, identityKey } from "@/lib/inbox/url";
import { formatDeadline, todayIso } from "@/lib/dates";

/** A promoted posting whose tracker entry is gone — deleted outright (the FK
 * nulls the link) or soft-deleted and waiting out its undo window. Either way
 * the posting is open again. */
const trackerEntryGone = or(
  isNull(jobPostings.promotedOpportunityId),
  inArray(
    jobPostings.promotedOpportunityId,
    db.select({ id: opportunities.id }).from(opportunities).where(isNotNull(opportunities.deletedAt)),
  ),
);

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
/** `note` is set when nothing new was created — the posting was already here. */
export type IngestResult = { id: number; note: string | null };

type ExistingPosting = Pick<JobPosting, "id" | "status" | "sourceUrl" | "dismissedReason" | "promotedOpportunityId" | "updatedAt" | "rawText" | "pageTitle">;

const existingColumns = {
  id: jobPostings.id,
  status: jobPostings.status,
  sourceUrl: jobPostings.sourceUrl,
  dismissedReason: jobPostings.dismissedReason,
  promotedOpportunityId: jobPostings.promotedOpportunityId,
  updatedAt: jobPostings.updatedAt,
  rawText: jobPostings.rawText,
  pageTitle: jobPostings.pageTitle,
};

/** A posting you already decided on. The same page twice is common — boards
 * repost, links get shared around — and it must not undo that decision. */
async function findByUrl(userId: string, url: string): Promise<ExistingPosting | null> {
  const target = canonicalUrl(url);
  const rows = await db
    .select(existingColumns)
    .from(jobPostings)
    .where(and(eq(jobPostings.userId, userId), sql`${jobPostings.sourceUrl} IS NOT NULL`))
    .orderBy(jobPostings.id);
  return rows.find((r) => r.sourceUrl && canonicalUrl(r.sourceUrl) === target) ?? null;
}

async function findByHash(userId: string, contentHash: string): Promise<ExistingPosting | null> {
  const [row] = await db
    .select(existingColumns)
    .from(jobPostings)
    .where(and(eq(jobPostings.userId, userId), eq(jobPostings.contentHash, contentHash)));
  return row ?? null;
}

/**
 * What to do when an ingest turns out to be a repeat. Dismissed and tracked
 * postings stay that way — reviving them is how the same job came back and
 * then got tracked twice. Anything still open is simply pointed at, and a
 * failed one gets another read.
 */
async function resolveExisting(existing: ExistingPosting, userId: string): Promise<IngestResult> {
  if (existing.status === "dismissed") {
    const when = formatDeadline(new Date(existing.updatedAt));
    throw new Error(
      `You dismissed this on ${when}${existing.dismissedReason ? ` (${existing.dismissedReason})` : ""}. It's under Dismissed if you want it back.`,
    );
  }
  if (existing.status === "promoted" && existing.promotedOpportunityId) {
    const [opp] = await db
      .select({ deletedAt: opportunities.deletedAt })
      .from(opportunities)
      .where(eq(opportunities.id, existing.promotedOpportunityId));
    if (opp && !opp.deletedAt) throw new Error("This is already in your tracker.");
  }
  if (existing.status === "failed" || isStuck(existing)) {
    await startExtraction(existing.id, existing.rawText, userId, { sourceUrl: existing.sourceUrl, pageTitle: existing.pageTitle });
    return { id: existing.id, note: "Already in your inbox — reading it again." };
  }
  return { id: existing.id, note: "That's already in your inbox." };
}

/**
 * Ingest a posting. The row is written with status 'extracting' and the
 * action returns straight away, so the card appears while the model works;
 * extraction, scoring and indexing run after the response. A crash mid-way
 * leaves a visible card that goes to failed, never silently nothing.
 */
export async function ingestPosting(input: IngestInput): Promise<ActionResult<IngestResult>> {
  return run(async () => {
    const userId = await requireUserId();

    let rawText: string;
    let sourceUrl: string | null = null;
    let pageTitle: string | null = null;

    if (input.kind === "url") {
      const url = input.url.trim();
      if (!/^https?:\/\//i.test(url)) throw new Error("That doesn't look like a URL. Paste the job description text instead.");
      // Checked before fetching: a repeat costs neither a request to the site
      // nor a model call.
      const known = await findByUrl(userId, url);
      if (known) return resolveExisting(known, userId);
      // Deliberately not caught: a blocked fetch must not create a row, because
      // there's no rawText for Retry to work against.
      const fetched = await fetchJobDescription(url);
      rawText = fetched.text;
      sourceUrl = fetched.url;
      pageTitle = fetched.title;
    } else {
      rawText = input.text.trim();
      if (rawText.length < 100) throw new Error("That's too short to be a job description.");
    }

    const contentHash = hashContent(rawText);
    const sameText = await findByHash(userId, contentHash);
    if (sameText) {
      // A re-paste of text first added by URL keeps the URL.
      if (!sameText.sourceUrl && sourceUrl) {
        await db.update(jobPostings).set({ sourceUrl }).where(eq(jobPostings.id, sameText.id));
      }
      return resolveExisting(sameText, userId);
    }

    const [posting] = await db
      .insert(jobPostings)
      .values({ userId, sourceUrl, pageTitle, rawText, contentHash, status: "extracting" })
      .onConflictDoNothing({ target: [jobPostings.userId, jobPostings.contentHash] })
      .returning({ id: jobPostings.id });
    // Lost a race with a concurrent ingest of the same text.
    if (!posting) {
      const winner = await findByHash(userId, contentHash);
      if (!winner) throw new Error("Couldn't save the posting — try again.");
      return resolveExisting(winner, userId);
    }

    await startExtraction(posting.id, rawText, userId, { sourceUrl, pageTitle });
    return { id: posting.id, note: null };
  });
}

/** Mark the row as being read and do the reading after the response. */
async function startExtraction(postingId: number, rawText: string, userId: string, hints: ExtractionHints): Promise<void> {
  await db
    .update(jobPostings)
    .set({ status: "extracting", failureReason: null, updatedAt: new Date() })
    .where(eq(jobPostings.id, postingId));
  after(() => runExtraction(postingId, rawText, userId, hints));
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
    if (posting.status === "extracting" && !isStuck(posting)) throw new Error("Still reading this one.");

    await startExtraction(postingId, posting.rawText, userId, { sourceUrl: posting.sourceUrl, pageTitle: posting.pageTitle });
  });
}

function extractionValues(e: Extraction) {
  return {
    kind: e.kind,
    role: e.role,
    company: e.company,
    eventName: e.eventName,
    stack: e.stack,
    compMin: e.compMin,
    compMax: e.compMax,
    compCurrency: e.compCurrency,
    prizeAmount: e.prizeAmount,
    prizeCurrency: e.prizeCurrency,
    location: e.location,
    remote: e.remote,
    deadline: e.deadline,
    startsOn: e.startsOn,
    endsOn: e.endsOn,
    teamSizeMax: e.teamSizeMax,
    eligibility: e.eligibility,
    themes: e.themes,
    seniority: e.seniority,
  };
}

/** Shared by ingest and retry. Never throws — it records the failure on the row
 * so the card can show it, which is the whole point of the 'extracting' write. */
async function runExtraction(postingId: number, rawText: string, userId: string, hints: ExtractionHints): Promise<void> {
  try {
    const result = await extractJobDescription(rawText, hints);

    const values = {
      ...extractionValues(result.extraction),
      model: result.model,
      promptVersion: result.promptVersion,
      attemptCount: result.attemptCount,
      retriedRule: result.retriedRule,
      rawResponse: result.rawResponse,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
    await db
      .insert(jobExtractions)
      .values({ postingId, ...values })
      .onConflictDoUpdate({ target: jobExtractions.postingId, set: values });

    await db
      .update(jobPostings)
      .set({ status: "new", failureReason: null, updatedAt: new Date() })
      .where(and(eq(jobPostings.id, postingId), eq(jobPostings.status, "extracting")));
  } catch (err) {
    const message = err instanceof FetchBlockedError || err instanceof Error
      ? err.message
      : "Extraction failed.";
    console.error(`[inbox] extraction failed for posting ${postingId}: ${message}`);
    await db
      .update(jobPostings)
      .set({ status: "failed", failureReason: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(jobPostings.id, postingId))
      .catch((e) => console.error(`[inbox] couldn't record the failure for posting ${postingId}:`, e));
    return;
  }

  // Everything after a good extraction is best-effort: the card is already
  // usable, and a score or an index can be filled in later from the card.
  await markDuplicate(postingId, userId).catch((e) => console.warn(`[inbox] duplicate check failed for ${postingId}:`, e));
  await scorePosting(postingId, userId).catch((e) => console.error(`[inbox] scoring failed for posting ${postingId}:`, e));
  await indexPosting(postingId, rawText);
}

/**
 * Flag a posting that looks like one already in the inbox: the same page
 * under a different URL spelling, or the same role at the same company. The
 * text hash can't catch these — boards embed view counts and timestamps, so
 * two fetches of one page never hash alike.
 */
async function markDuplicate(postingId: number, userId: string): Promise<void> {
  const rows = await db
    .select({
      id: jobPostings.id,
      sourceUrl: jobPostings.sourceUrl,
      kind: jobExtractions.kind,
      company: jobExtractions.company,
      role: jobExtractions.role,
      eventName: jobExtractions.eventName,
    })
    .from(jobPostings)
    .leftJoin(jobExtractions, eq(jobExtractions.postingId, jobPostings.id))
    .where(eq(jobPostings.userId, userId))
    .orderBy(jobPostings.id);

  const self = rows.find((r) => r.id === postingId);
  if (!self) return;
  const url = self.sourceUrl ? canonicalUrl(self.sourceUrl) : null;
  const key = identityKey(self.kind, self.company, self.kind === "hackathon" ? self.eventName : self.role);

  const original = rows.find((r) =>
    r.id < postingId && (
      (url && r.sourceUrl && canonicalUrl(r.sourceUrl) === url) ||
      (key && identityKey(r.kind, r.company, r.kind === "hackathon" ? r.eventName : r.role) === key)
    ),
  );
  await db.update(jobPostings).set({ duplicateOfId: original?.id ?? null }).where(eq(jobPostings.id, postingId));
}

/** Build what a card shows. Scores are computed here, on read, from the
 * current profile — only the fit dimension comes from storage. */
function toCard(
  posting: JobPosting,
  extraction: JobExtraction | null,
  stored: MatchScore | null,
  profile: UserProfile | null,
  trackerDeletedAt: Date | null,
): InboxCard {
  let p = markStuck(posting);
  // The tracker entry was deleted: the posting is open again rather than
  // claiming to be in a tracker it isn't in.
  if (p.status === "promoted" && (p.promotedOpportunityId === null || trackerDeletedAt !== null)) {
    p = { ...p, status: "new" };
  }
  return {
    ...p,
    rawText: "",
    extraction,
    score: extraction && profile ? scoreCard(extraction, profile, stored?.breakdown ?? null) : null,
  };
}

async function profileFor(userId: string): Promise<UserProfile | null> {
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  return profile ?? null;
}

export type InboxData = { cards: InboxCard[]; hasProfile: boolean };

/** The Inbox fetches its own data on mount — postings never travel through
 * page.tsx, so rawText stays out of the tracker payload entirely. */
export async function listPostings(): Promise<ActionResult<InboxData>> {
  return run(async () => {
    const userId = await requireUserId();

    const [rows, profile] = await Promise.all([
      db
        .select({ posting: jobPostings, extraction: jobExtractions, score: matchScores, trackerDeletedAt: opportunities.deletedAt })
        .from(jobPostings)
        .leftJoin(jobExtractions, eq(jobExtractions.postingId, jobPostings.id))
        .leftJoin(
          matchScores,
          and(eq(matchScores.postingId, jobPostings.id), eq(matchScores.userId, userId)),
        )
        .leftJoin(opportunities, eq(opportunities.id, jobPostings.promotedOpportunityId))
        .where(eq(jobPostings.userId, userId))
        .orderBy(desc(jobPostings.createdAt)),
      profileFor(userId),
    ]);

    return {
      cards: rows.map(({ posting, extraction, score, trackerDeletedAt }) => toCard(posting, extraction, score, profile, trackerDeletedAt)),
      hasProfile: profile !== null,
    };
  });
}

/**
 * Chunk and embed a posting so it can be searched. Deliberately not part of
 * the extraction try/catch's failure path: a posting that parsed fine but
 * could not be embedded is still a perfectly good card, so an indexing failure
 * is logged and swallowed rather than marking the whole thing failed. Returns
 * whether anything was indexed.
 */
async function indexPosting(postingId: number, rawText: string): Promise<boolean> {
  try {
    const chunks = chunkJobDescription(rawText);
    if (chunks.length === 0) return false;

    const embeddings = await embedTexts(chunks.map(embeddableText));

    await db.transaction(async (tx) => {
      // Replace wholesale: a re-extraction may produce different sections, and
      // leftover chunks from the previous run would match queries forever.
      await tx.delete(jobChunks).where(eq(jobChunks.postingId, postingId));
      await tx.insert(jobChunks).values(
        chunks.map((c, i) => ({
          postingId,
          chunkIndex: i,
          section: c.section,
          content: c.content,
          embedding: embeddings[i] ?? null,
        })),
      );
    });
    return true;
  } catch (e) {
    console.warn(`[inbox] indexing failed for posting ${postingId}:`, e instanceof Error ? e.message : e);
    return false;
  }
}

function isStuck(posting: Pick<JobPosting, "status" | "updatedAt">): boolean {
  return posting.status === "extracting" && Date.now() - new Date(posting.updatedAt).getTime() >= STUCK_AFTER_MS;
}

/**
 * A row only stays 'extracting' past the time limit if the process died
 * mid-call — a function timeout, a deploy, a crash. Left alone that card
 * renders a skeleton forever with no way out, so it's reported as failed and
 * becomes retryable.
 */
function markStuck(posting: JobPosting): JobPosting {
  if (!isStuck(posting)) return posting;
  return {
    ...posting,
    status: "failed",
    failureReason: "Reading this posting was interrupted — the server didn't finish. Retry to try again.",
  };
}

/** Dismiss with a reason. Kept rather than deleted — "pay too low" from three
 * months ago is worth seeing when the same company posts again. Works on a
 * failed card too, so one that never parses isn't stuck in New forever. */
export async function dismissPosting(postingId: number, reason: string): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserId();
    const updated = await db
      .update(jobPostings)
      .set({ status: "dismissed", dismissedReason: reason.trim().slice(0, 200) || null, updatedAt: new Date() })
      .where(and(
        eq(jobPostings.id, postingId),
        eq(jobPostings.userId, userId),
        or(ne(jobPostings.status, "promoted"), trackerEntryGone),
      ))
      .returning({ id: jobPostings.id });
    if (updated.length === 0) throw new Error("Not found, or already in your tracker.");
  });
}

/** Undo a dismissal — back into the open bucket. */
export async function restorePosting(postingId: number): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserId();
    const [row] = await db
      .select({ id: jobPostings.id, hasExtraction: jobExtractions.id })
      .from(jobPostings)
      .leftJoin(jobExtractions, eq(jobExtractions.postingId, jobPostings.id))
      .where(and(eq(jobPostings.id, postingId), eq(jobPostings.userId, userId), eq(jobPostings.status, "dismissed")));
    if (!row) throw new Error("Not found");
    // A card dismissed while failed comes back failed, so it can be retried.
    await db
      .update(jobPostings)
      .set({ status: row.hasExtraction ? "new" : "failed", dismissedReason: null, updatedAt: new Date() })
      .where(eq(jobPostings.id, postingId));
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

    return db.transaction(async (tx) => {
      // Claim the posting first. The conditional update takes the row lock, so
      // a double-click's second request waits, then finds nothing to claim —
      // rather than both passing a read-then-insert check.
      const [claimed] = await tx
        .update(jobPostings)
        .set({ status: "promoted", updatedAt: new Date() })
        .where(and(
          eq(jobPostings.id, postingId),
          eq(jobPostings.userId, userId),
          or(
            eq(jobPostings.status, "new"),
            and(eq(jobPostings.status, "promoted"), trackerEntryGone),
          ),
        ))
        .returning();

      if (!claimed) {
        const [current] = await tx
          .select({ status: jobPostings.status })
          .from(jobPostings)
          .where(and(eq(jobPostings.id, postingId), eq(jobPostings.userId, userId)));
        throw new Error(
          !current ? "Not found"
            : current.status === "promoted" ? "This is already in your tracker."
            : current.status === "dismissed" ? "Restore this posting before tracking it."
            : current.status === "extracting" ? "Still reading this one — try again in a moment."
            : "This posting couldn't be read. Retry it first.",
        );
      }

      const [e] = await tx.select().from(jobExtractions).where(eq(jobExtractions.postingId, postingId));
      if (!e) throw new Error("This posting hasn't been read yet. Retry it first.");

      const hackathon = e.kind === "hackathon";
      const name = hackathon
        ? e.eventName?.trim() || e.company?.trim() || claimed.pageTitle?.trim() || "Untitled hackathon"
        : e.company?.trim() || e.role?.trim() || "Untitled opportunity";

      const [opp] = await tx
        .insert(opportunities)
        .values({
          createdBy: userId,
          type: hackathon ? "hackathon" : "job",
          name,
          source: claimed.sourceUrl ? hostOf(claimed.sourceUrl) : "Inbox",
          deadline: e.deadline ?? null,
          role: hackathon ? null : e.role,
          stack: e.stack ?? null,
          compMin: hackathon ? null : e.compMin,
          compMax: hackathon ? null : e.compMax,
          compCurrency: hackathon ? null : e.compCurrency,
          location: e.location,
          remote: e.remote,
        })
        .returning({ id: opportunities.id });

      await tx.insert(userOpportunityTracking).values({
        userId,
        opportunityId: opp.id,
        status: "found",
        foundDate: todayIso(),
      });

      if (claimed.sourceUrl) {
        await tx.insert(opportunityUrls).values({
          opportunityId: opp.id,
          label: hackathon ? "Hackathon" : "Posting",
          url: claimed.sourceUrl,
        });
      }

      await tx
        .update(jobPostings)
        .set({ promotedOpportunityId: opp.id })
        .where(eq(jobPostings.id, postingId));

      return opp.id;
    });
  }, { revalidate: "/" });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Inbox";
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD.");
const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((s) => s || null);
const amount = z.number().int("Amounts must be whole numbers.").nonnegative("Amounts can't be negative.").max(2_000_000_000).nullable();

/** Every export of a "use server" module is a public endpoint, so the form's
 * own checks count for nothing here. */
const manualSchema = z.object({
  kind: z.enum(["job", "hackathon"]).default("job"),
  role: z.string().trim().max(200),
  company: z.string().trim().max(200),
  stack: z.array(z.string().trim().toLowerCase().max(60)).max(60).transform((a) => [...new Set(a.filter(Boolean))]),
  compMin: amount,
  compMax: amount,
  compCurrency: optionalText(8).transform((s) => s?.toUpperCase() ?? null),
  location: optionalText(200),
  remote: z.enum(["onsite", "hybrid", "remote", "unclear"]),
  deadline: isoDate.nullable(),
  seniority: optionalText(60),
  sourceUrl: optionalText(2000).refine((u) => u === null || /^https?:\/\/\S+$/i.test(u), "The link must start with http:// or https://."),
  notes: optionalText(4000),
});

export type ManualPostingInput = z.input<typeof manualSchema>;

/**
 * Add a posting by hand. It lands in the same tables as a parsed one and is
 * scored by the same rubric — the only difference is `model: "manual"`, so a
 * bad score can always be traced back to whether a model was involved. For a
 * hackathon, `role` is the event's name and the pay fields are the prize.
 */
export async function addManualPosting(input: ManualPostingInput): Promise<ActionResult<number>> {
  return run(async () => {
    const userId = await requireUserId();

    const parsed = manualSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Some fields aren't valid.");
    const f = parsed.data;
    if (!f.company && !f.role) throw new Error("Give it at least a name or a company.");

    const hackathon = f.kind === "hackathon";
    const extraction = normalizeExtraction({
      kind: f.kind,
      role: hackathon ? null : f.role || null,
      company: f.company || null,
      eventName: hackathon ? f.role || null : null,
      stack: f.stack,
      compMin: f.compMin,
      compMax: f.compMax,
      compCurrency: f.compMin !== null || f.compMax !== null ? f.compCurrency ?? "INR" : null,
      prizeAmount: null,
      prizeCurrency: null,
      location: f.location,
      remote: f.remote,
      deadline: f.deadline,
      startsOn: null,
      endsOn: null,
      teamSizeMax: null,
      eligibility: null,
      themes: [],
      seniority: hackathon ? null : f.seniority,
    });
    // Only the rules about the numbers themselves apply — the text-evidence
    // rules would flag a hand-typed "remote" for having no posting to back it.
    const bad = checkExtraction(extraction, "");
    if (bad && (bad.rule.startsWith("comp_") || bad.rule === "deadline_unparseable")) {
      throw new Error(
        bad.rule === "comp_inverted" ? "“Pay from” is higher than “Pay to”."
          : bad.rule === "comp_out_of_range" ? "That pay doesn't look like an annual figure — enter the yearly amount."
          : bad.message,
      );
    }

    // The rubric's fit dimension reads text, and Retry needs something to work
    // against, so a hand-filled entry still gets a readable body.
    const rawText = [
      hackathon ? f.role && `Hackathon: ${f.role}` : f.role && `Role: ${f.role}`,
      f.company && `${hackathon ? "Organiser" : "Company"}: ${f.company}`,
      f.location && `Location: ${f.location}`,
      f.stack.length > 0 && `Technologies: ${f.stack.join(", ")}`,
      f.seniority && !hackathon && `Seniority: ${f.seniority}`,
      f.notes,
    ].filter(Boolean).join("\n");

    const contentHash = hashContent(`manual:${userId}:${f.kind}:${f.company}:${f.role}:${f.sourceUrl ?? ""}`);
    const existing = await findByHash(userId, contentHash) ?? (f.sourceUrl ? await findByUrl(userId, f.sourceUrl) : null);
    if (existing && (existing.status === "dismissed" || (existing.status === "promoted" && existing.promotedOpportunityId))) {
      await resolveExisting(existing, userId); // throws with the reason
    }

    const postingId = await db.transaction(async (tx) => {
      let id: number;
      if (existing) {
        // Typing the same entry again edits it rather than adding a twin.
        await tx
          .update(jobPostings)
          .set({ status: "new", rawText, sourceUrl: f.sourceUrl ?? existing.sourceUrl, failureReason: null, updatedAt: new Date() })
          .where(eq(jobPostings.id, existing.id));
        id = existing.id;
      } else {
        const [posting] = await tx
          .insert(jobPostings)
          .values({ userId, sourceUrl: f.sourceUrl, rawText, contentHash, status: "new" })
          .returning({ id: jobPostings.id });
        id = posting.id;
      }

      const values = {
        ...extractionValues(extraction),
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
        .values({ postingId: id, ...values })
        .onConflictDoUpdate({ target: jobExtractions.postingId, set: values });

      return id;
    });

    await markDuplicate(postingId, userId).catch(() => {});
    await scorePosting(postingId, userId).catch((e) => console.error(`[inbox] scoring failed for posting ${postingId}:`, e));
    after(() => indexPosting(postingId, rawText));
    return postingId;
  });
}

/* ────────────────────────────── Profile & scoring ────────────────────────── */

export async function getProfile(): Promise<ActionResult<UserProfile | null>> {
  return run(async () => profileFor(await requireUserId()));
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

/** Saving the profile reassesses fit for every open posting. The other
 * dimensions are recomputed on every read, so they're current regardless. */
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
    try {
      if (await scorePosting(row.id, uid)) scored++;
    } catch (e) {
      console.error(`[inbox] scoring failed for posting ${row.id}:`, e instanceof Error ? e.message : e);
    }
  }
  return scored;
}

/** Assess fit for one card — the button on a card whose fit is pending. */
export async function rescorePosting(postingId: number): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserId();
    const [owned] = await db
      .select({ id: jobPostings.id })
      .from(jobPostings)
      .where(and(eq(jobPostings.id, postingId), eq(jobPostings.userId, userId)));
    if (!owned) throw new Error("Not found");
    if (!(await scorePosting(postingId, userId))) {
      throw new Error("Set up your match profile in Settings first.");
    }
  });
}

/** Score one posting against the user's profile and store it. Throws on a
 * database failure so callers decide whether that matters; returns false only
 * when there's nothing to score against. */
async function scorePosting(postingId: number, userId: string): Promise<boolean> {
  const [profile, [extraction], [existing]] = await Promise.all([
    profileFor(userId),
    db.select().from(jobExtractions).where(eq(jobExtractions.postingId, postingId)),
    // The previous breakdown carries the fit dimension and the key it was
    // computed from, so an unchanged fit costs nothing to keep.
    db
      .select({ breakdown: matchScores.breakdown })
      .from(matchScores)
      .where(and(eq(matchScores.postingId, postingId), eq(matchScores.userId, userId))),
  ]);
  if (!profile || !extraction) return false;

  const { total, breakdown } = await scoreMatch(extraction, profile, existing?.breakdown ?? null);
  const values = { postingId, userId, total, breakdown, rubricVersion: RUBRIC_VERSION, createdAt: new Date() };
  await db
    .insert(matchScores)
    .values(values)
    .onConflictDoUpdate({ target: [matchScores.postingId, matchScores.userId], set: values });
  return true;
}

/* ────────────────────────────── Search ───────────────────────────────── */

export type SearchResult = { card: InboxCard; hit: SearchHit };

/**
 * Hybrid search across the user's postings. Returns whole cards in fused rank
 * order, each with the snippet and the engines that matched, so the UI can say
 * why something surfaced.
 */
export async function searchPostings(query: string): Promise<ActionResult<SearchResult[]>> {
  return run(async () => {
    const userId = await requireUserId();
    const hits = await hybridSearch(userId, query);
    if (hits.length === 0) return [];

    const ids = hits.map((h) => h.postingId);
    const [rows, profile] = await Promise.all([
      db
        .select({ posting: jobPostings, extraction: jobExtractions, score: matchScores, trackerDeletedAt: opportunities.deletedAt })
        .from(jobPostings)
        .leftJoin(jobExtractions, eq(jobExtractions.postingId, jobPostings.id))
        .leftJoin(
          matchScores,
          and(eq(matchScores.postingId, jobPostings.id), eq(matchScores.userId, userId)),
        )
        .leftJoin(opportunities, eq(opportunities.id, jobPostings.promotedOpportunityId))
        .where(and(eq(jobPostings.userId, userId), inArray(jobPostings.id, ids))),
      profileFor(userId),
    ]);

    const byId = new Map(rows.map((r) => [r.posting.id, r]));
    // Rebuilt from `hits` rather than `rows` so fused rank order survives.
    return hits.flatMap((hit) => {
      const row = byId.get(hit.postingId);
      if (!row) return [];
      return [{ card: toCard(row.posting, row.extraction, row.score, profile, row.trackerDeletedAt), hit }];
    });
  });
}

/** Index anything that has no chunks yet — postings ingested before search
 * existed, or ones whose embedding call failed at the time. Counts only what
 * actually got indexed. */
export async function backfillSearchIndex(): Promise<ActionResult<{ indexed: number; failed: number }>> {
  return run(async () => {
    const userId = await requireUserId();
    const rows = await db
      .select({ id: jobPostings.id, rawText: jobPostings.rawText })
      .from(jobPostings)
      .leftJoin(jobChunks, eq(jobChunks.postingId, jobPostings.id))
      .where(and(eq(jobPostings.userId, userId), ne(jobPostings.status, "extracting"), isNull(jobChunks.id)));

    let indexed = 0, failed = 0;
    for (const row of rows) {
      if (await indexPosting(row.id, row.rawText)) indexed++;
      else failed++;
    }
    return { indexed, failed };
  });
}
