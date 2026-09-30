import { STATUS_FOR_TYPE, STATUS_ORDER, type Status } from "./constants";

export type TypeFilter = "all" | "job" | "hackathon";
export type StatusFilter = "all" | Status;
export type QuickFilter = "" | "stale" | "overdue";

const TYPE_FILTERS: TypeFilter[] = ["all", "job", "hackathon"];
const QUICK_FILTERS: QuickFilter[] = ["", "stale", "overdue"];

/* The tracker's filters live in the URL, which is shareable and
 * hand-editable, so anything read from it is narrowed to a known value — an
 * unknown `type` used to crash the page, and an unknown `quick` showed an
 * "Overdue only" chip that filtered nothing. */

export function parseType(v: string): TypeFilter {
  return TYPE_FILTERS.includes(v as TypeFilter) ? (v as TypeFilter) : "all";
}

/** Also drops a status that doesn't exist for the chosen type. */
export function parseStatus(v: string, type: TypeFilter): StatusFilter {
  const allowed = type === "all" ? STATUS_ORDER : STATUS_FOR_TYPE[type];
  return allowed.includes(v as Status) ? (v as Status) : "all";
}

export function parseQuick(v: string): QuickFilter {
  return QUICK_FILTERS.includes(v as QuickFilter) ? (v as QuickFilter) : "";
}
