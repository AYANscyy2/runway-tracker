import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { CardScore, JobExtraction, MatchBreakdown, MatchDimension, UserProfile } from "@/db/schema";
import { MODEL_ID, QuotaError } from "./extract";
import { convert, isKnownCurrency } from "./currency";
import { DIMENSION_ORDER, MAX_TOTAL, WEIGHTS, type PostingKind } from "./dimensions";
import { daysUntil, todayIso } from "@/lib/dates";

export { MAX_TOTAL };

/** Bump when weights or dimension meanings change, so old scores stay readable. */
export const RUBRIC_VERSION = "2026-09-30.1";

type Weights = (typeof WEIGHTS)[PostingKind];

function kindOf(e: JobExtraction): PostingKind {
  return e.kind === "hackathon" ? "hackathon" : "job";
}

/** Aliases so "postgres" in a profile matches "postgresql" in a posting. Keys
 * are compared after lowercasing and collapsing whitespace. */
const ALIASES: Record<string, string> = {
  postgres: "postgresql", pg: "postgresql", js: "javascript", ts: "typescript",
  golang: "go", k8s: "kubernetes",
  "google cloud": "gcp", "google cloud platform": "gcp",
  "amazon web services": "aws", "aws cloud": "aws",
  tailwindcss: "tailwind", "tailwind css": "tailwind",
};

/** "React.js", "reactjs" and "react" are one technology; so are "node.js",
 * "nodejs" and "node". Aliases are checked before and after the suffix goes. */
export function normalise(tech: string): string {
  const t = tech.trim().toLowerCase().replace(/\s+/g, " ");
  if (ALIASES[t]) return ALIASES[t];
  const stripped = t.replace(/\.?js$/, "");
  if (stripped && stripped !== t) return ALIASES[stripped] ?? stripped;
  return t;
}

/** "a, b, c and 3 more" — so a reason never silently drops names. */
function listSome(items: string[], n: number): string {
  if (items.length <= n) return items.join(", ");
  return `${items.slice(0, n).join(", ")} and ${items.length - n} more`;
}

/** Posting technologies keyed by normalised form, keeping the posting's own
 * spelling for the reason text. */
function techMap(list: string[] | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of list ?? []) if (t.trim()) m.set(normalise(t), t.trim());
  return m;
}

const dim = (score: number, max: number, reason: string): MatchDimension => ({ score: Math.round(score), max, reason });

/**
 * Everything objective is computed here rather than asked of the model: stack
 * overlap, whether the pay clears your floor, whether the location works, and
 * whether you're free in time. A model asked "is this a good match" will
 * happily produce 78 with no way to check it.
 */
function scoreJobStack(e: JobExtraction, p: UserProfile, max: number): MatchDimension {
  const want = new Set((p.stack ?? []).map(normalise));
  const has = techMap(e.stack);
  if (want.size === 0) return dim(max * 0.5, max, "No stack set in your profile — scored neutral.");
  if (has.size === 0) return dim(max * 0.5, max, "The posting names no technologies.");

  const overlap = [...has].filter(([k]) => want.has(k)).map(([, v]) => v);
  const missing = [...has].filter(([k]) => !want.has(k)).map(([, v]) => v);
  const reason = overlap.length === 0
    ? `None of ${listSome(missing, 4)} are in your stack.`
    : `You match ${overlap.length}/${has.size}: ${listSome(overlap, 5)}.`;
  return dim(max * (overlap.length / has.size), max, reason);
}

/**
 * A hackathon's tool list is a menu, not a requirement: sponsors name every
 * product they'd like you to try, and a twelve-item list shouldn't score zero
 * because you know two of them. Using any one of them is most of the value —
 * judges reward the sponsor's tools — and two covers it. Knowing none still
 * isn't disqualifying, since most events let you build with your own stack.
 */
function scoreHackathonStack(e: JobExtraction, p: UserProfile, max: number): MatchDimension {
  const want = new Set((p.stack ?? []).map(normalise));
  const has = techMap(e.stack);
  if (want.size === 0) return dim(max * 0.5, max, "No stack set in your profile — scored neutral.");
  if (has.size === 0) return dim(max * 0.6, max, "No required tools named — build with what you know.");

  const overlap = [...has].filter(([k]) => want.has(k)).map(([, v]) => v);
  if (overlap.length >= 2) return dim(max, max, `You already use ${listSome(overlap, 4)} from the suggested tools.`);
  if (overlap.length === 1) return dim(max * 0.7, max, `You already use ${overlap[0]}; the rest (${listSome([...has.values()].filter((v) => v !== overlap[0]), 3)}) would be new.`);
  return dim(max * 0.25, max, `None of the suggested tools (${listSome([...has.values()], 4)}) are in your stack — you'd be learning as you build.`);
}

function scoreComp(e: JobExtraction, p: UserProfile, max: number): MatchDimension {
  const target = p.targetCompMin;
  if (target === null) return dim(max * 0.5, max, "No target compensation set.");
  if (e.compMin === null && e.compMax === null) return dim(max * 0.5, max, "The posting doesn't state compensation.");
  // A posting in another currency is converted to yours at an approximate rate
  // rather than skipped — $120k plainly clears an 18L target, and refusing to
  // say so is the less useful answer.
  const from = e.compCurrency?.trim().toUpperCase() ?? p.compCurrency;
  const to = p.compCurrency.trim().toUpperCase();
  const raw = e.compMax ?? e.compMin!;
  let converted = false;

  let offered = raw;
  if (from !== to) {
    if (!isKnownCurrency(from) || !isKnownCurrency(to)) {
      return dim(max * 0.5, max, `Quoted in ${from}; no conversion rate to ${to}, so pay wasn't compared.`);
    }
    offered = convert(raw, from, to)!;
    converted = true;
  }

  // Indian digit grouping for rupees, Western grouping for everything else.
  const grouped = raw.toLocaleString(from === "INR" ? "en-IN" : "en-US");
  const note = converted ? ` (${grouped} ${from} converted at an approximate rate)` : "";
  if (offered >= target) {
    const stretch = p.targetCompMax && offered >= p.targetCompMax;
    return dim(max, max, `${stretch ? "At or above the top of your range" : "Clears your target"}${note}.`);
  }
  // Partial credit down to 60% of target, zero below that.
  const ratio = Math.max(0, (offered - target * 0.6) / (target * 0.4));
  return dim(max * ratio, max, `Tops out below your target (${Math.round((offered / target) * 100)}% of it)${note}.`);
}

/** Prize pools aren't compared against your salary target — a ₹2L prize for a
 * weekend is a different thing from ₹2L a year. $10k (converted) or more is
 * full marks; anything stated still earns a floor, since the prize is rarely
 * the reason to enter. */
const PRIZE_FULL_USD = 10_000;

function scorePrize(e: JobExtraction, max: number): MatchDimension {
  if (e.prizeAmount === null) return dim(max * 0.5, max, "No prize pool stated.");
  const currency = e.prizeCurrency?.trim().toUpperCase() || "USD";
  const grouped = `${e.prizeAmount.toLocaleString(currency === "INR" ? "en-IN" : "en-US")} ${currency}`;
  const usd = convert(e.prizeAmount, currency, "USD");
  if (usd === null) return dim(max * 0.5, max, `${grouped} in prizes; no rate to compare it.`);
  const ratio = 0.4 + 0.6 * Math.min(1, usd / PRIZE_FULL_USD);
  return dim(max * ratio, max, `${grouped} in prizes${currency === "USD" ? "" : ` (about $${usd.toLocaleString("en-US")})`}.`);
}

function matchesPreferred(location: string, p: UserProfile): boolean | null {
  const wanted = (p.preferredLocations ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return null;
  const loc = location.toLowerCase();
  return wanted.some((w) => loc.includes(w) || w.includes(loc));
}

function scoreLocation(e: JobExtraction, p: UserProfile, max: number): MatchDimension {
  if (e.remote === "remote") return dim(max, max, "Remote — location doesn't matter.");

  // Already returned above if the role is remote, so this branch is the mismatch.
  if (p.remotePreference === "remote") {
    return dim(max * 0.2, max, `You want remote; this is ${e.remote === "unclear" ? "not stated" : e.remote}.`);
  }
  if (!(p.preferredLocations ?? []).some((l) => l.trim())) return dim(max * 0.5, max, "No preferred locations set.");
  if (!e.location) return dim(max * 0.5, max, "The posting doesn't state a location.");
  return matchesPreferred(e.location, p)
    ? dim(max, max, `${e.location} is on your list.`)
    : dim(0, max, `${e.location} isn't one of your preferred locations.`);
}

function scoreFormat(e: JobExtraction, p: UserProfile, max: number): MatchDimension {
  if (e.remote === "remote") return dim(max, max, "Online — join from anywhere.");
  if (e.remote === "hybrid") return dim(max * 0.9, max, `Online or in person${e.location ? ` in ${e.location}` : ""}.`);
  if (e.remote === "unclear") return dim(max * 0.5, max, "Whether it's online or in person isn't stated.");
  if (!e.location) return dim(max * 0.5, max, "In person, location not stated.");
  const hit = matchesPreferred(e.location, p);
  if (hit === null) return dim(max * 0.5, max, `In person in ${e.location}; no preferred locations set to compare.`);
  return hit
    ? dim(max, max, `In person in ${e.location}, which is on your list.`)
    : dim(max * 0.2, max, `In person in ${e.location} — you'd need to travel.`);
}

function scoreJobTiming(e: JobExtraction, p: UserProfile, max: number): MatchDimension {
  if (!e.deadline) return dim(max, max, "No deadline stated.");
  if (e.deadline < todayIso()) return dim(0, max, "The deadline has passed.");
  if (p.availableFrom && e.deadline < p.availableFrom) return dim(max * 0.5, max, "Closes before you're available.");
  return dim(max, max, p.availableFrom ? "Open and within your availability." : "Still open.");
}

function scoreHackathonTiming(e: JobExtraction, p: UserProfile, max: number): MatchDimension {
  if (e.deadline && e.deadline < todayIso()) return dim(0, max, "Submissions have closed.");
  if (p.availableFrom && e.endsOn && e.endsOn < p.availableFrom) return dim(max * 0.25, max, "It ends before you're available.");
  if (!e.deadline) return dim(max * 0.6, max, "No submission deadline stated.");
  const days = daysUntil(e.deadline) ?? 0;
  if (days <= 2) return dim(max * 0.5, max, `Submissions close ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} — tight.`);
  if (days <= 6) return dim(max * 0.8, max, `Submissions close in ${days} days.`);
  return dim(max, max, `${days} days left to submit.`);
}

/** The fit dimension only depends on these. If none of them changed, the
 * previous answer is still the right answer — and worth reusing, because a
 * free-tier key is measured in tens of requests a day. */
export function fitKeyFor(e: JobExtraction, p: UserProfile): string {
  const parts: unknown[] = [e.role, e.company, e.seniority, e.stack ?? [], p.seniority, p.stack ?? [], p.notes];
  // Appended only for hackathons so every existing job's key stays the same
  // and its stored fit keeps being reused.
  if (kindOf(e) === "hackathon") parts.push("hackathon", e.eventName, e.themes ?? [], e.eligibility);
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

/**
 * The arithmetic half of the score plus whatever fit is stored. Pure and
 * cheap, so the Inbox runs it on every read: a deadline that passed yesterday
 * or a profile edit shows up immediately, and a posting whose fit call failed
 * still gets a number instead of no badge at all.
 */
export function scoreCard(e: JobExtraction, p: UserProfile, stored: MatchBreakdown | null): CardScore {
  const kind = kindOf(e);
  const w: Weights = WEIGHTS[kind];
  const key = fitKeyFor(e, p);
  const fresh = !!stored?.fit && stored.fitKey === key;

  let fit: MatchDimension;
  if (fresh) {
    // Rescaled in case the stored fit was scored against a different weight.
    fit = dim((stored!.fit.score / stored!.fit.max) * w.fit, w.fit, stored!.fit.reason);
  } else {
    const why = !stored?.fit
      ? "Fit not assessed yet — scored neutral."
      : !stored.fitKey
        ? stored.fit.reason // the fallback reason, e.g. out of quota
        : "Your profile changed since fit was assessed — scored neutral until it's rescored.";
    fit = dim(w.fit * 0.5, w.fit, why);
  }

  const breakdown: MatchBreakdown = kind === "hackathon"
    ? {
        stack: scoreHackathonStack(e, p, w.stack),
        comp: scorePrize(e, w.comp),
        location: scoreFormat(e, p, w.location),
        startDate: scoreHackathonTiming(e, p, w.startDate),
        fit,
        fitKey: fresh ? key : undefined,
      }
    : {
        stack: scoreJobStack(e, p, w.stack),
        comp: scoreComp(e, p, w.comp),
        location: scoreLocation(e, p, w.location),
        startDate: scoreJobTiming(e, p, w.startDate),
        fit,
        fitKey: fresh ? key : undefined,
      };
  const total = DIMENSION_ORDER.reduce((sum, k) => sum + breakdown[k].score, 0);
  return { total, breakdown, fitPending: !fresh };
}

const fitSchema = z.object({
  score: z.number().min(0).max(100).describe("0-100, how well this suits the candidate beyond the mechanical checks."),
  // Deliberately unconstrained: a length cap here fails the whole response
  // when the model runs one sentence long. Ask for brevity, enforce it below.
  reason: z.string().describe("One short sentence (under 25 words), addressed to the candidate."),
});

const JOB_FIT_SYSTEM =
  "You judge how well a role suits a candidate on the things a checklist misses: seniority fit, " +
  "the shape of the work, and how it fits their stated goals. Ignore salary, location and exact " +
  "technology overlap — those are scored separately. Be sceptical; 50 is an average match.";

const HACKATHON_FIT_SYSTEM =
  "You judge how well a hackathon suits a candidate: whether its themes and platform match their " +
  "interests and goals, whether it would be a good use of their time, and whether the eligibility " +
  "text plausibly excludes them (if it clearly does, score very low and say so). Ignore prize money, " +
  "format and exact technology overlap — those are scored separately. This is an event, not a job: " +
  "never talk about the 'role'. Be sceptical; 50 is an average match.";

function fitPrompt(e: JobExtraction, p: UserProfile): string {
  const candidate = [
    `Candidate seniority: ${p.seniority ?? "not stated"}`,
    `Candidate stack: ${(p.stack ?? []).join(", ") || "not stated"}`,
    `What they're looking for: ${p.notes?.trim() || "not stated"}`,
  ];
  if (kindOf(e) === "hackathon") {
    return [
      `Hackathon: ${e.eventName ?? "unnamed"}${e.company ? ` by ${e.company}` : ""}`,
      `Themes: ${(e.themes ?? []).join(", ") || "not stated"}`,
      `Suggested tools: ${(e.stack ?? []).join(", ") || "not stated"}`,
      `Eligibility: ${e.eligibility ?? "not stated"}`,
      ``,
      ...candidate,
    ].join("\n");
  }
  return [
    `Role: ${e.role ?? "unknown"} at ${e.company ?? "unknown"}`,
    `Seniority: ${e.seniority ?? "not stated"}`,
    `Technologies: ${(e.stack ?? []).join(", ") || "not stated"}`,
    ``,
    ...candidate,
  ].join("\n");
}

/** The only thing the model is asked: the fuzzy "would this suit them" read
 * that no rule captures. It never sees the other dimensions' scores, so it
 * can't anchor on them. */
async function scoreFit(e: JobExtraction, p: UserProfile): Promise<{ dimension: MatchDimension; ok: boolean }> {
  const max = WEIGHTS[kindOf(e)].fit;
  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: fitSchema,
      system: kindOf(e) === "hackathon" ? HACKATHON_FIT_SYSTEM : JOB_FIT_SYSTEM,
      prompt: fitPrompt(e, p),
      temperature: 0,
      // A 429 needs a 35-second wait, not an immediate retry — the SDK's
      // default burns three quota units to fail the same way once.
      maxRetries: 0,
    });
    const reason = object.reason.trim();
    return {
      dimension: dim((object.score / 100) * max, max, reason.length > 200 ? `${reason.slice(0, 197)}…` : reason),
      ok: true,
    };
  } catch (err) {
    // A model outage shouldn't sink the whole score — fall back to neutral and
    // say so, but leave a trace: a silent fallback looks like a real 50%.
    console.warn(`[inbox] fit scoring failed: ${err instanceof Error ? err.message : err}`);
    const reason = err instanceof QuotaError || /quota|rate.?limit|RESOURCE_EXHAUSTED|\b429\b/i.test(String(err))
      ? "Fit not assessed — out of free-tier requests. Use Assess fit on the card later."
      : "Couldn't assess fit — scored neutral. Use Assess fit on the card to try again.";
    return { dimension: dim(max * 0.5, max, reason), ok: false };
  }
}

/** Score including the fit dimension, calling the model only when the stored
 * fit was computed from different inputs. */
export async function scoreMatch(
  e: JobExtraction,
  p: UserProfile,
  previous?: MatchBreakdown | null,
): Promise<{ total: number; breakdown: MatchBreakdown }> {
  const key = fitKeyFor(e, p);
  if (previous?.fit && previous.fitKey === key) {
    const { total, breakdown } = scoreCard(e, p, previous);
    return { total, breakdown };
  }
  const scored = await scoreFit(e, p);
  // A fit that fell back (outage, quota) is stored without its key, so the
  // card shows it as pending and the next rescore tries again rather than
  // freezing a neutral 50% in place forever.
  const stored = { fit: scored.dimension, fitKey: scored.ok ? key : undefined } as MatchBreakdown;
  const { total, breakdown } = scoreCard(e, p, stored);
  return { total, breakdown };
}
