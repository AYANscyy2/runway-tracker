import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { JobExtraction, MatchBreakdown, UserProfile } from "@/db/schema";
import { MODEL_ID } from "./extract";

/** Bump when weights or dimension meanings change, so old scores stay readable. */
export const RUBRIC_VERSION = "2026-09-20.1";

const WEIGHTS = { stack: 35, comp: 25, location: 15, startDate: 5, fit: 20 } as const;
export const MAX_TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

/** Aliases so "postgres" in a profile matches "postgresql" in a posting. */
const ALIASES: Record<string, string> = {
  postgres: "postgresql", pg: "postgresql", js: "javascript", ts: "typescript",
  node: "node.js", nodejs: "node.js", reactjs: "react", nextjs: "next.js",
  golang: "go", k8s: "kubernetes", gcp: "google cloud", "aws cloud": "aws",
};

function normalise(tech: string): string {
  const t = tech.trim().toLowerCase().replace(/\.js$/, ".js");
  return ALIASES[t] ?? t;
}

/**
 * Everything objective is computed here rather than asked of the model: stack
 * overlap, whether the pay clears your floor, whether the location works, and
 * whether you're free in time. A model asked "is this a good match" will
 * happily produce 78 with no way to check it.
 */
function scoreStack(posting: string[] | null, profile: string[] | null) {
  const want = new Set((profile ?? []).map(normalise));
  const has = new Set((posting ?? []).map(normalise));
  if (want.size === 0) return { score: Math.round(WEIGHTS.stack * 0.5), max: WEIGHTS.stack, reason: "No stack set in your profile — scored neutral." };
  if (has.size === 0) return { score: Math.round(WEIGHTS.stack * 0.5), max: WEIGHTS.stack, reason: "The posting names no technologies." };

  const overlap = [...has].filter((t) => want.has(t));
  const ratio = overlap.length / has.size;
  const score = Math.round(WEIGHTS.stack * ratio);
  const reason = overlap.length === 0
    ? `None of ${[...has].slice(0, 4).join(", ")} are in your stack.`
    : `You match ${overlap.length}/${has.size}: ${overlap.slice(0, 5).join(", ")}.`;
  return { score, max: WEIGHTS.stack, reason };
}

function scoreComp(e: JobExtraction, p: UserProfile) {
  const max = WEIGHTS.comp;
  const target = p.targetCompMin;
  if (target === null) return { score: Math.round(max * 0.5), max, reason: "No target compensation set." };
  if (e.compMin === null && e.compMax === null) return { score: Math.round(max * 0.5), max, reason: "The posting doesn't state compensation." };
  if (e.compCurrency && p.compCurrency && e.compCurrency.toUpperCase() !== p.compCurrency.toUpperCase()) {
    return { score: Math.round(max * 0.5), max, reason: `Quoted in ${e.compCurrency}, your target is in ${p.compCurrency} — not compared.` };
  }

  const offered = e.compMax ?? e.compMin!;
  if (offered >= target) {
    const stretch = p.targetCompMax && offered >= p.targetCompMax;
    return { score: max, max, reason: stretch ? "At or above the top of your range." : "Clears your target." };
  }
  // Partial credit down to 60% of target, zero below that.
  const ratio = Math.max(0, (offered - target * 0.6) / (target * 0.4));
  return { score: Math.round(max * ratio), max, reason: `Tops out below your target (${Math.round((offered / target) * 100)}% of it).` };
}

function scoreLocation(e: JobExtraction, p: UserProfile) {
  const max = WEIGHTS.location;
  if (e.remote === "remote") return { score: max, max, reason: "Remote — location doesn't matter." };

  const wanted = (p.preferredLocations ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean);
  // Already returned above if the role is remote, so this branch is the mismatch.
  if (p.remotePreference === "remote") {
    return { score: Math.round(max * 0.2), max, reason: `You want remote; this is ${e.remote === "unclear" ? "not stated" : e.remote}.` };
  }
  if (wanted.length === 0) return { score: Math.round(max * 0.5), max, reason: "No preferred locations set." };
  if (!e.location) return { score: Math.round(max * 0.5), max, reason: "The posting doesn't state a location." };

  const loc = e.location.toLowerCase();
  const hit = wanted.find((w) => loc.includes(w) || w.includes(loc));
  if (hit) return { score: max, max, reason: `${e.location} is on your list.` };
  return { score: 0, max, reason: `${e.location} isn't one of your preferred locations.` };
}

function scoreStartDate(e: JobExtraction, p: UserProfile) {
  const max = WEIGHTS.startDate;
  if (!e.deadline) return { score: max, max, reason: "No deadline stated." };
  const today = new Date().toISOString().slice(0, 10);
  if (e.deadline < today) return { score: 0, max, reason: "The deadline has passed." };
  if (p.availableFrom && e.deadline < p.availableFrom) {
    return { score: Math.round(max * 0.5), max, reason: "Closes before you're available." };
  }
  return { score: max, max, reason: "Open and within your availability." };
}

const fitSchema = z.object({
  score: z.number().min(0).max(100).describe("0-100, how well this role suits the candidate beyond the mechanical checks."),
  // Deliberately unconstrained: a length cap here fails the whole response
  // when the model runs one sentence long. Ask for brevity, enforce it below.
  reason: z.string().describe("One short sentence (under 25 words), addressed to the candidate."),
});

/** The only thing the model is asked: the fuzzy "would this suit them" read
 * that no rule captures. It never sees the other dimensions' scores, so it
 * can't anchor on them. */
async function scoreFit(e: JobExtraction, p: UserProfile) {
  const max = WEIGHTS.fit;
  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: fitSchema,
      system:
        "You judge how well a role suits a candidate on the things a checklist misses: seniority fit, " +
        "the shape of the work, and how it fits their stated goals. Ignore salary, location and exact " +
        "technology overlap — those are scored separately. Be sceptical; 50 is an average match.",
      prompt: [
        `Role: ${e.role ?? "unknown"} at ${e.company ?? "unknown"}`,
        `Seniority: ${e.seniority ?? "not stated"}`,
        `Technologies: ${(e.stack ?? []).join(", ") || "not stated"}`,
        ``,
        `Candidate seniority: ${p.seniority ?? "not stated"}`,
        `Candidate stack: ${(p.stack ?? []).join(", ") || "not stated"}`,
        `What they're looking for: ${p.notes?.trim() || "not stated"}`,
      ].join("\n"),
      temperature: 0,
    });
    const reason = object.reason.trim();
    return {
      score: Math.round((object.score / 100) * max),
      max,
      reason: reason.length > 200 ? `${reason.slice(0, 197)}…` : reason,
    };
  } catch (e) {
    // A model outage shouldn't sink the whole score — fall back to neutral and
    // say so, but leave a trace: a silent fallback looks like a real 50%.
    console.warn(`[inbox] fit scoring failed: ${e instanceof Error ? e.message : e}`);
    return { score: Math.round(max * 0.5), max, reason: "Couldn't assess fit — scored neutral." };
  }
}

export async function scoreMatch(e: JobExtraction, p: UserProfile): Promise<{ total: number; breakdown: MatchBreakdown }> {
  const [stack, comp, location, startDate, fit] = [
    scoreStack(e.stack, p.stack),
    scoreComp(e, p),
    scoreLocation(e, p),
    scoreStartDate(e, p),
    await scoreFit(e, p),
  ];
  const breakdown: MatchBreakdown = { stack, comp, location, startDate, fit };
  const total = Object.values(breakdown).reduce((sum, d) => sum + d.score, 0);
  return { total, breakdown };
}
