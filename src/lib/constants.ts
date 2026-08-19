import type { Opportunity, UserOpportunityTracking } from "@/db/schema";

type Status = UserOpportunityTracking["status"];

export const STATUS_ORDER: Status[] = [
  "found",
  "applied",
  "oa_assignment",
  "in_progress",
  "selected",
  "rejected",
  "hackathon_active",
];

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

export const TYPE_LABEL: Record<Opportunity["type"], string> = {
  job:      "Company",
  hackathon: "Hackathon",
};

export const TERMINAL_STATUSES: Status[] = ["selected", "rejected"];
