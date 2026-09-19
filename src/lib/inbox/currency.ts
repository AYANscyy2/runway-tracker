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

/** Annual pay below this, expressed in INR, is almost certainly a monthly or
 * hourly figure that wasn't converted. Used as a units sanity check. */
export const MIN_SANE_ANNUAL_INR = 100_000;
export const MAX_SANE_ANNUAL_INR = 200_000_000;
