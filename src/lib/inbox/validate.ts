import type { Extraction } from "./schema";

/**
 * Rules the Zod schema can't express: a response can be perfectly well-typed
 * and still obviously wrong. A violation triggers one retry with the specific
 * complaint fed back to the model, and the rule name is stored on the
 * extraction row so a pattern of failures is visible later.
 */
export type Violation = { rule: string; message: string };

// A JD in INR below ~1L/yr or above ~20Cr is a units mistake, not a real offer
// — usually a monthly figure passed through unconverted.
const INR_MIN = 100_000;
const INR_MAX = 200_000_000;

const REMOTE_HINTS = /\b(remote|work from home|wfh|distributed team|anywhere)\b/i;
const ONSITE_HINTS = /\b(on[- ]?site|in[- ]?office|in person|relocat)\b/i;

export function checkExtraction(e: Extraction, rawText: string): Violation | null {
  if (e.compMin !== null && e.compMax !== null && e.compMin > e.compMax) {
    return { rule: "comp_inverted", message: `compMin (${e.compMin}) is greater than compMax (${e.compMax}).` };
  }

  const currency = e.compCurrency?.toUpperCase() ?? null;
  if (currency === "INR") {
    for (const [field, value] of [["compMin", e.compMin], ["compMax", e.compMax]] as const) {
      if (value !== null && (value < INR_MIN || value > INR_MAX)) {
        return {
          rule: "comp_out_of_range",
          message: `${field} is ${value} INR, which is outside a believable annual range. If the posting quotes a monthly or LPA figure, convert it to annual rupees.`,
        };
      }
    }
  }

  if ((e.compMin !== null || e.compMax !== null) && !currency) {
    return { rule: "comp_without_currency", message: "A compensation figure was returned with no compCurrency." };
  }

  // The model likes to assume remote. Only accept it if the text supports it.
  if (e.remote === "remote" && !REMOTE_HINTS.test(rawText)) {
    return { rule: "remote_unsupported", message: "You answered 'remote' but the posting never says so. Use 'unclear' unless it is stated." };
  }
  if (e.remote === "onsite" && !ONSITE_HINTS.test(rawText) && REMOTE_HINTS.test(rawText)) {
    return { rule: "onsite_contradicted", message: "You answered 'onsite' but the posting mentions remote work." };
  }

  if (e.deadline !== null && Number.isNaN(Date.parse(e.deadline))) {
    return { rule: "deadline_unparseable", message: `deadline '${e.deadline}' is not a real date.` };
  }

  return null;
}

/**
 * A deadline in the past isn't a model error — expired postings get pasted all
 * the time — so it's surfaced on the card instead of forcing a retry.
 */
export function isExpired(deadline: string | null): boolean {
  if (!deadline) return false;
  const today = new Date().toISOString().slice(0, 10);
  return deadline < today;
}
