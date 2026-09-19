import { google } from "@ai-sdk/google";
import { generateObject, NoObjectGeneratedError } from "ai";
import { PROMPT_VERSION, SYSTEM_PROMPT, extractionSchema, type Extraction } from "./schema";
import { checkExtraction, type Violation } from "./validate";

// Overridable so the model can be bumped without a deploy-time code change.
export const MODEL_ID = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// USD per million tokens. Only used for the cost line in the log — keep it
// roughly right rather than authoritative.
const RATES: Record<string, { in: number; out: number }> = {
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
};

// A very long JD is nearly always boilerplate padding ("about us", legal).
const MAX_INPUT_CHARS = 24_000;

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

function userPrompt(rawText: string, retryFor: Violation | null): string {
  const jd = rawText.slice(0, MAX_INPUT_CHARS);
  if (!retryFor) return `Job description:\n\n${jd}`;
  return [
    `Job description:\n\n${jd}`,
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
export async function extractJobDescription(rawText: string): Promise<ExtractionResult> {
  let violation: Violation | null = null;
  let last: { extraction: Extraction; usage: { inputTokens?: number; outputTokens?: number }; raw: unknown } | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let result;
    try {
      result = await generateObject({
        model: google(MODEL_ID),
        schema: extractionSchema,
        system: SYSTEM_PROMPT,
        prompt: userPrompt(rawText, violation),
        temperature: 0,
      });
    } catch (e) {
      // A schema-invalid response on the first attempt is worth one more go;
      // on the second we surface it, since the row is already marked failed.
      if (NoObjectGeneratedError.isInstance(e) && attempt === 1) {
        violation = { rule: "schema_invalid", message: "Your previous answer did not match the required JSON schema." };
        continue;
      }
      throw e;
    }

    last = { extraction: result.object, usage: result.usage, raw: result.object };
    const found = checkExtraction(result.object, rawText);

    if (!found) {
      logCost(MODEL_ID, result.usage.inputTokens ?? null, result.usage.outputTokens ?? null, attempt);
      return {
        extraction: result.object,
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
