/**
 * Approximate conversion, used only to compare a posting's pay against your
 * target. It is deliberately a static table rather than a live FX call: a
 * scoring dimension shouldn't depend on a third-party API being up, and being
 * 5% out never changes whether a role clears your floor. Update it when it
 * drifts enough to matter.
 *
 * Units: how many INR one unit of the currency is worth.
 */
const INR_PER: Record<string, number> = {
  INR: 1,
  USD: 88,
  EUR: 95,
  GBP: 111,
  AED: 24,
  SGD: 65,
  CAD: 63,
  AUD: 57,
  CHF: 99,
  JPY: 0.58,
};

export function isKnownCurrency(code: string | null | undefined): boolean {
  return !!code && code.trim().toUpperCase() in INR_PER;
}

/** Returns null when either currency is one we have no rate for — the caller
 * then says so rather than comparing two incomparable numbers. */
export function convert(amount: number, from: string, to: string): number | null {
  const f = INR_PER[from.trim().toUpperCase()];
  const t = INR_PER[to.trim().toUpperCase()];
  if (!f || !t) return null;
  return Math.round((amount * f) / t);
}

/**
 * The lowest believable *annual* salary in each currency, used to catch a
 * figure that was really monthly or hourly.
 *
 * These are per-currency rather than one INR threshold converted, because
 * converting a single floor makes it wrong nearly everywhere. India's floor
 * has to sit near ₹1L to allow for real internship stipends — converted, that
 * is about $1,100, so a "$9,000" that was actually a monthly figure sails
 * through. Set against local pay instead, each one catches what it should.
 */
const MIN_ANNUAL: Record<string, number> = {
  INR: 100_000,     // a modest internship stipend is genuinely this low
  USD: 15_000,      // below any US full-time floor
  EUR: 12_000,
  GBP: 12_000,
  AED: 40_000,
  SGD: 18_000,
  CAD: 20_000,
  AUD: 22_000,
  CHF: 25_000,
  JPY: 1_500_000,
};

/** Above this, in INR, the figure is a data-entry error rather than an offer. */
export const MAX_SANE_ANNUAL_INR = 200_000_000;

/** The floor for a currency, or null when we have no basis for one. */
export function minAnnualFor(code: string): number | null {
  return MIN_ANNUAL[code.trim().toUpperCase()] ?? null;
}
