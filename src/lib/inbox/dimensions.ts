/**
 * Score dimensions, their weights and labels. Kept free of any server import so
 * the Inbox view can use it without pulling the model SDK into the browser.
 */

export type PostingKind = "job" | "hackathon";
export type DimensionKey = "stack" | "comp" | "location" | "startDate" | "fit";

/** Display order. Never iterate the stored breakdown object instead: it also
 * carries `fitKey`, and jsonb hands keys back sorted by length. */
export const DIMENSION_ORDER: DimensionKey[] = ["stack", "comp", "location", "startDate", "fit"];

/**
 * A hackathon is judged on different things than a job: prizes matter less
 * than pay does, whether you can make it matters more than where it is, and
 * the named tools are suggestions rather than requirements.
 */
export const WEIGHTS: Record<PostingKind, Record<DimensionKey, number>> = {
  job:       { stack: 35, comp: 25, location: 15, startDate: 5,  fit: 20 },
  hackathon: { stack: 25, comp: 15, location: 20, startDate: 20, fit: 20 },
};

export const MAX_TOTAL = 100;

const LABELS: Record<PostingKind, Record<DimensionKey, string>> = {
  job:       { stack: "Stack", comp: "Pay",   location: "Location", startDate: "Timing", fit: "Fit" },
  hackathon: { stack: "Stack", comp: "Prize", location: "Format",   startDate: "Timing", fit: "Fit" },
};

export function dimensionLabel(key: DimensionKey, kind: PostingKind | null | undefined): string {
  return LABELS[kind ?? "job"][key];
}
