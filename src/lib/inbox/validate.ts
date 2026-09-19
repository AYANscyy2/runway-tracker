import type { Extraction } from "./schema";
import { MAX_SANE_ANNUAL_INR, MIN_SANE_ANNUAL_INR, convert, isKnownCurrency } from "./currency";
import { todayIso } from "@/lib/dates";

/**
 * Rules the Zod schema can't express: a response can be perfectly well-typed
 * and still obviously wrong. A violation triggers one retry with the specific
 * complaint fed back to the model, and the rule name is stored on the
 * extraction row so a pattern of failures is visible later.
 */
export type Violation = { rule: string; message: string };

const REMOTE_HINTS = /\b(remote|work from home|wfh|distributed team|anywhere)\b/i;
const ONSITE_HINTS = /\b(on[- ]?site|in[- ]?office|in person|relocat)\b/i;

export function checkExtraction(e: Extraction, rawText: string): Violation | null {
  if (e.compMin !== null && e.compMax !== null && e.compMin > e.compMax) {
    return { rule: "comp_inverted", message: `compMin (${e.compMin}) is greater than compMax (${e.compMax}).` };
  }

  // The units check runs for any currency we have a rate for, not just INR: a
  // "$8,000" that was really per month is the same mistake as an unconverted
  // LPA figure.
  const currency = e.compCurrency?.trim().toUpperCase() ?? null;
  if (currency && isKnownCurrency(currency)) {
    for (const [field, value] of [["compMin", e.compMin], ["compMax", e.compMax]] as const) {
      if (value === null) continue;
      const inr = convert(value, currency, "INR");
      if (inr !== null && (inr < MIN_SANE_ANNUAL_INR || inr > MAX_SANE_ANNUAL_INR)) {
        return {
          rule: "comp_out_of_range",
          message: `${field} is ${value} ${currency}, which is not a believable annual salary. If the posting quotes a monthly, weekly or hourly figure, convert it to an annual one.`,
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
  const today = todayIso();
  return deadline < today;
}
