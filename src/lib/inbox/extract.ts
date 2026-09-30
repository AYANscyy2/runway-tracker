import { google } from "@ai-sdk/google";
import { generateObject, NoObjectGeneratedError } from "ai";
import { PROMPT_VERSION, SYSTEM_PROMPT, extractionSchema, type Extraction } from "./schema";
import { checkExtraction, normalizeExtraction, type Violation } from "./validate";
import { isBoilerplate } from "./chunk";

// Overridable so the model can be bumped without a deploy-time code change.
// Flash-lite by default: the free tier allows far more requests a day than
// flash, and pulling named fields out of a job description is not a task that
// needs the larger model.
export const MODEL_ID = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

// USD per million tokens. Only used for the cost line in the log — keep it
// roughly right rather than authoritative.
const RATES: Record<string, { in: number; out: number }> = {
  "gemini-3.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-3.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
};

// A very long JD is nearly always boilerplate padding ("about us", legal).
const MAX_INPUT_CHARS = 24_000;

export class QuotaError extends Error {
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const wait = /retry in ([\d.]+)s/i.exec(detail)?.[1];
    super(
      wait
        ? `Google's free tier is out of requests for now — try again in about ${Math.ceil(Number(wait))} seconds.`
        : "Google's free tier is out of requests for today. It resets on their clock, or you can add billing to the key.",
    );
    this.name = "QuotaError";
  }
}

function isQuotaError(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|\b429\b/i.test(m);
}

export type ExtractionResult = {
  extraction: Extraction;
  model: string;
  promptVersion: string;
  attemptCount: number;
  retriedRule: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  rawResponse: unknown;
};

/** What the page itself says about where it came from — often the only place
 * a hackathon's name appears. */
export type ExtractionHints = { sourceUrl?: string | null; pageTitle?: string | null };

/** Paragraphs worth keeping from past the cut: the facts a card is built
 * from tend to sit in a prizes table or a dates section near the end. */
const KEY_FACTS = /(prize|award|cash|\$\s?\d|₹\s?\d|€\s?\d|£\s?\d|\b(lpa|ctc|salary|stipend|compensation)\b|deadline|submission period|submissions? (open|close|due)|apply by|last date|eligib|team size|teams? of up to|remote|online|virtual|in[- ]person|location)/i;

/**
 * Strip site chrome, then fit the text to the model's budget. A long page
 * keeps its opening (title, company, the gist) and then the paragraphs from
 * the rest that state concrete facts — cutting a 45 KB rules page at 24 KB
 * from the top loses the prize table entirely.
 */
export function prepareText(rawText: string): string {
  const clean = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !isBoilerplate(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  if (clean.length <= MAX_INPUT_CHARS) return clean;

  const HEAD = Math.floor(MAX_INPUT_CHARS * 0.6);
  const head = clean.slice(0, HEAD);
  const out = [head, "\n\n[…later excerpts…]\n"];
  let used = head.length + 24;
  for (const para of clean.slice(HEAD).split(/\n{2,}/)) {
    if (!KEY_FACTS.test(para)) continue;
    const piece = para.length > 600 ? `${para.slice(0, 600)}…` : para;
    if (used + piece.length + 2 > MAX_INPUT_CHARS) break;
    out.push(piece);
    used += piece.length + 2;
  }
  return out.join("\n");
}

function userPrompt(rawText: string, retryFor: Violation | null, hints: ExtractionHints): string {
  const header = [
    hints.pageTitle && `Page title: ${hints.pageTitle}`,
    hints.sourceUrl && `Source URL: ${hints.sourceUrl}`,
  ].filter(Boolean).join("\n");
  const body = `${header ? `${header}\n\n` : ""}Posting text:\n\n${prepareText(rawText)}`;
  if (!retryFor) return body;
  return [
    body,
    ``,
    `Your previous answer was rejected: ${retryFor.message}`,
    `Re-read the posting and correct that field. Leave the others as they were unless they were wrong too.`,
  ].join("\n");
}

function logCost(model: string, inputTokens: number | null, outputTokens: number | null, attempts: number) {
  const rate = RATES[model];
  const cost = rate && inputTokens !== null && outputTokens !== null
    ? ((inputTokens * rate.in + outputTokens * rate.out) / 1_000_000).toFixed(6)
    : "unknown";
  console.log(
    `[inbox] extract model=${model} attempts=${attempts} in=${inputTokens ?? "?"} out=${outputTokens ?? "?"} cost=$${cost}`,
  );
}

/**
 * Extract once, check the result against the post-validation rules, and retry
 * exactly once if a rule fires — feeding the specific violation back in. A
 * second failure is kept rather than discarded: a flagged imperfect extraction
 * is more useful than none, and `retriedRule` records what went wrong.
 */
export async function extractJobDescription(rawText: string, hints: ExtractionHints = {}): Promise<ExtractionResult> {
  let violation: Violation | null = null;
  let last: { extraction: Extraction; usage: { inputTokens?: number; outputTokens?: number }; raw: unknown } | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let result;
    try {
      result = await generateObject({
        model: google(MODEL_ID),
        schema: extractionSchema,
        system: SYSTEM_PROMPT,
        prompt: userPrompt(rawText, violation, hints),
        temperature: 0,
        // Our own retry loop handles a bad response; the SDK's default retry
        // just spends quota failing the same way three times.
        maxRetries: 0,
      });
    } catch (e) {
      // Out of quota is not something a retry fixes — surface it immediately
      // with the wait time the API gave us, rather than burning another unit.
      if (isQuotaError(e)) throw new QuotaError(e);
      // A schema-invalid response on the first attempt is worth one more go;
      // on the second we surface it, since the row is already marked failed.
      if (NoObjectGeneratedError.isInstance(e) && attempt === 1) {
        violation = { rule: "schema_invalid", message: "Your previous answer did not match the required JSON schema." };
        continue;
      }
      throw e;
    }

    const extraction = normalizeExtraction(result.object);
    last = { extraction, usage: result.usage, raw: result.object };
    const found = checkExtraction(extraction, rawText, hints.sourceUrl);

    if (!found) {
      logCost(MODEL_ID, result.usage.inputTokens ?? null, result.usage.outputTokens ?? null, attempt);
      return {
        extraction,
        model: MODEL_ID,
        promptVersion: PROMPT_VERSION,
        attemptCount: attempt,
        retriedRule: violation?.rule ?? null,
        inputTokens: result.usage.inputTokens ?? null,
        outputTokens: result.usage.outputTokens ?? null,
        rawResponse: result.object,
      };
    }

    violation = found;
  }

  if (!last) throw new Error("Extraction produced no result.");

  logCost(MODEL_ID, last.usage.inputTokens ?? null, last.usage.outputTokens ?? null, 2);
  console.warn(`[inbox] extraction kept with unresolved rule=${violation?.rule}`);
  return {
    extraction: last.extraction,
    model: MODEL_ID,
    promptVersion: PROMPT_VERSION,
    attemptCount: 2,
    retriedRule: violation?.rule ?? null,
    inputTokens: last.usage.inputTokens ?? null,
    outputTokens: last.usage.outputTokens ?? null,
    rawResponse: last.raw,
  };
}
