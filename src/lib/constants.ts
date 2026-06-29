import type { Opportunity } from "@/db/schema";

export const STATUS_ORDER: Opportunity["status"][] = [
  "found",
  "applied",
  "in_progress",
  "selected",
  "rejected",
];

export const STATUS_LABEL: Record<Opportunity["status"], string> = {
  found: "Found",
  applied: "Applied",
  in_progress: "In progress",
  selected: "Selected",
  rejected: "Rejected",
};

// Tailwind class fragments per status — used for the colored status pill.
export const STATUS_CLASSES: Record<Opportunity["status"], string> = {
  found: "bg-surface-2 text-ink-muted border-border",
  applied: "bg-info-soft text-info border-info/30",
  in_progress: "bg-amber-soft text-amber border-amber/30",
  selected: "bg-success-soft text-success border-success/30",
  rejected: "bg-danger-soft text-danger border-danger/30",
};

export const TYPE_LABEL: Record<Opportunity["type"], string> = {
  job: "Company",
  hackathon: "Hackathon",
};

export const TERMINAL_STATUSES: Opportunity["status"][] = ["selected", "rejected"];
