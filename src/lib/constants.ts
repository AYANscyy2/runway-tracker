import type { Opportunity, UserOpportunityTracking } from "@/db/schema";

export type Status = UserOpportunityTracking["status"];
export type OppType = Opportunity["type"];

export const STATUS_ORDER: Status[] = [
  "found",
  "applied",
  "oa_assignment",
  "in_progress",
  "selected",
  "rejected",
  "hackathon_active",
];

// Jobs and hackathons share a pipeline shape but not every stage applies to
// both — a job never becomes "Hackathon Active" and a hackathon has no OA.
export const STATUS_FOR_TYPE: Record<OppType, Status[]> = {
  job:       ["found", "applied", "oa_assignment", "in_progress", "selected", "rejected"],
  hackathon: ["found", "applied", "hackathon_active", "selected", "rejected"],
};

export const STATUS_LABEL: Record<Status, string> = {
  found:            "Found",
  applied:          "Applied",
  oa_assignment:    "OA / Assignment",
  in_progress:      "In Progress",
  selected:         "Selected",
  rejected:         "Rejected",
  hackathon_active: "Hackathon Active",
};

// Background values used for status badges and select styling.
export const STATUS_COLOR: Record<Status, string> = {
  found:            "var(--color-status-found)",
  applied:          "var(--color-status-applied)",
  oa_assignment:    "var(--color-status-oa-assignment)",
  in_progress:      "var(--color-status-in-progress)",
  selected:         "var(--color-status-selected)",
  rejected:         "var(--color-status-rejected)",
  hackathon_active: "var(--color-status-hackathon-active)",
};

export const TYPE_LABEL: Record<OppType, string> = {
  job:      "Company",
  hackathon: "Hackathon",
};

export const TERMINAL_STATUSES: Status[] = ["selected", "rejected"];

/** Days an "applied" entry can sit untouched before we call it stale. */
export const STALE_AFTER_DAYS = 14;

/**
 * A deadline is only actionable while you still have to act on it. For a job
 * that's the application deadline — once you've applied it's moot. For a
 * hackathon it's the submission deadline (what the Inbox fills in), which
 * matters until you're in the event: once it's "hackathon active" you've
 * registered and submitted, and the date passing isn't something to clean up.
 */
export function deadlineMatters(type: OppType, status: Status): boolean {
  if (TERMINAL_STATUSES.includes(status)) return false;
  if (type === "hackathon") return status === "found" || status === "applied";
  return status === "found";
}

/** What the single date field means for each type. */
export const DEADLINE_LABEL: Record<OppType, string> = {
  job: "Deadline",
  hackathon: "Submission deadline",
};
