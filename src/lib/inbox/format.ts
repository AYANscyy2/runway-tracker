import type { JobExtraction } from "@/db/schema";

const REMOTE_LABEL: Record<string, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
  unclear: "Not stated",
};

/** A hackathon's format reads differently from a job's work setup. */
const FORMAT_LABEL: Record<string, string> = {
  onsite: "In person",
  hybrid: "Online + in person",
  remote: "Online",
  unclear: "Format not stated",
};

export function remoteLabel(remote: string | null, kind: string | null = "job"): string {
  const labels = kind === "hackathon" ? FORMAT_LABEL : REMOTE_LABEL;
  return remote ? labels[remote] ?? remote : labels.unclear;
}

/** "$25k in prizes" */
export function prizeLabel(e: Pick<JobExtraction, "prizeAmount" | "prizeCurrency">): string | null {
  if (e.prizeAmount === null) return null;
  const band = compBand({ compMin: e.prizeAmount, compMax: e.prizeAmount, compCurrency: e.prizeCurrency ?? "USD" });
  return band ? `${band} in prizes` : null;
}

/** "₹12L – ₹18L" — compact enough to sit in a card row. */
export function compBand(e: Pick<JobExtraction, "compMin" | "compMax" | "compCurrency">): string | null {
  if (e.compMin === null && e.compMax === null) return null;
  const currency = (e.compCurrency ?? "INR").toUpperCase();
  const fmt = (n: number) => {
    if (currency === "INR") {
      if (n >= 10_000_000) return `₹${round(n / 10_000_000)}Cr`;
      if (n >= 100_000) return `₹${round(n / 100_000)}L`;
      return `₹${n.toLocaleString("en-IN")}`;
    }
    const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : `${currency} `;
    return n >= 1000 ? `${symbol}${round(n / 1000)}k` : `${symbol}${n}`;
  };
  const lo = e.compMin, hi = e.compMax;
  if (lo !== null && hi !== null) return lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
  return fmt((lo ?? hi)!);
}

function round(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
