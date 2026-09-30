import type { Extraction } from "./schema";
import { MAX_SANE_ANNUAL_INR, convert, isKnownCurrency, minAnnualFor } from "./currency";
import { todayIso } from "@/lib/dates";

/**
 * Rules the Zod schema can't express: a response can be perfectly well-typed
 * and still obviously wrong. A violation triggers one retry with the specific
 * complaint fed back to the model, and the rule name is stored on the
 * extraction row so a pattern of failures is visible later.
 */
export type Violation = { rule: string; message: string };

/** Sites that only host hackathons. A "job" from one of these is a misread. */
const HACKATHON_HOSTS = /(^|\.)(devpost\.com|devfolio\.co|mlh\.io|dorahacks\.io|lablab\.ai|ethglobal\.com|taikai\.network)$/i;

export function isHackathonHost(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return HACKATHON_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Text that is plainly about a hackathon: the word itself, repeatedly, next
 * to the vocabulary of one. A job ad mentioning "we sponsor hackathons" once
 * does not trip it. */
function readsLikeHackathon(rawText: string): boolean {
  const mentions = rawText.match(/\bhackathons?\b/gi)?.length ?? 0;
  return mentions >= 3 && /\b(submission|judging|judges|prizes?|official rules)\b/i.test(rawText);
}

/**
 * Fixes that are mechanical enough not to need another model call. A
 * hackathon's prize reported as compensation is the common one — moving it is
 * cheaper and more reliable than asking again.
 */
export function normalizeExtraction(e: Extraction): Extraction {
  if (e.kind !== "hackathon") {
    return { ...e, eventName: null, prizeAmount: null, prizeCurrency: null, startsOn: null, endsOn: null, teamSizeMax: null, eligibility: null, themes: [] };
  }
  const prizeAmount = e.prizeAmount ?? e.compMax ?? e.compMin;
  const prizeCurrency = e.prizeAmount !== null ? e.prizeCurrency : (e.compCurrency ?? e.prizeCurrency);
  return {
    ...e,
    role: null,
    seniority: null,
    compMin: null,
    compMax: null,
    compCurrency: null,
    prizeAmount,
    prizeCurrency: prizeAmount !== null ? (prizeCurrency?.trim().toUpperCase() || null) : null,
    // An online event has no location; what the model found is almost always
    // the sponsor's address from the rules.
    location: e.remote === "remote" ? null : e.location,
  };
}

const REMOTE_HINTS = /\b(remote|work from home|wfh|distributed team|anywhere)\b/i;
const ONLINE_HINTS = /\b(remote|online|virtual|virtually|from anywhere)\b/i;
const ONSITE_HINTS = /\b(on[- ]?site|in[- ]?office|in person|relocat)\b/i;

export function checkExtraction(e: Extraction, rawText: string, sourceUrl?: string | null): Violation | null {
  if (e.kind === "job" && !e.role && (isHackathonHost(sourceUrl) || readsLikeHackathon(rawText))) {
    return {
      rule: "kind_mismatch",
      message: "This page is a hackathon, not a job posting. Set kind to 'hackathon' and fill the event fields (eventName, prizeAmount, deadline, format).",
    };
  }

  if (e.compMin !== null && e.compMax !== null && e.compMin > e.compMax) {
    return { rule: "comp_inverted", message: `compMin (${e.compMin}) is greater than compMax (${e.compMax}).` };
  }

  // The units check runs for any currency we have a floor for, not just INR:
  // a "$8,000" that was really per month is the same mistake as an unconverted
  // LPA figure, but it needs a US-sized floor to be caught.
  const currency = e.compCurrency?.trim().toUpperCase() ?? null;
  const floor = currency ? minAnnualFor(currency) : null;
  if (currency && floor !== null) {
    for (const [field, value] of [["compMin", e.compMin], ["compMax", e.compMax]] as const) {
      if (value === null) continue;
      const tooHigh = isKnownCurrency(currency)
        && (convert(value, currency, "INR") ?? 0) > MAX_SANE_ANNUAL_INR;
      if (value < floor || tooHigh) {
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
  // A hackathon says "online" or "virtual" where a job would say "remote".
  const remoteHints = e.kind === "hackathon" ? ONLINE_HINTS : REMOTE_HINTS;
  if (e.remote === "remote" && !remoteHints.test(rawText)) {
    return { rule: "remote_unsupported", message: "You answered 'remote' but the posting never says so. Use 'unclear' unless it is stated." };
  }
  if (e.remote === "onsite" && !ONSITE_HINTS.test(rawText) && REMOTE_HINTS.test(rawText)) {
    return { rule: "onsite_contradicted", message: "You answered 'onsite' but the posting mentions remote work." };
  }

  for (const [field, value] of [["deadline", e.deadline], ["startsOn", e.startsOn], ["endsOn", e.endsOn]] as const) {
    if (value !== null && !isRealDate(value)) {
      return { rule: "deadline_unparseable", message: `${field} '${value}' is not a real date.` };
    }
  }

  return null;
}

/** Date.parse accepts "2026-02-31" by rolling it over, so round-trip it. */
function isRealDate(iso: string): boolean {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso;
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
