/** Parses a 'YYYY-MM-DD' string (or Date) as a calendar date, ignoring time/timezone entirely. */
function toCalendarDate(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Whole-day difference between today and a deadline. Negative = overdue. */
export function daysUntil(deadline: string | Date | null): number | null {
  if (!deadline) return null;
  const today = toCalendarDate(new Date());
  const target = toCalendarDate(deadline);
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function formatDeadline(deadline: string | Date | null): string {
  if (!deadline) return "No deadline";
  return toCalendarDate(deadline).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Short, human countdown label: "in 3 days", "today", "5 days overdue". */
export function countdownLabel(deadline: string | Date | null): string {
  const days = daysUntil(deadline);
  if (days === null) return "—";
  if (days === 0) return "today";
  if (days > 0) return `in ${days}d`;
  return `${Math.abs(days)}d overdue`;
}

export type Urgency = "none" | "ok" | "soon" | "urgent" | "overdue";

export function urgencyFor(deadline: string | Date | null, isTerminal: boolean): Urgency {
  if (!deadline || isTerminal) return "none";
  const days = daysUntil(deadline);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days === 0) return "urgent";
  if (days <= 3) return "urgent";
  if (days <= 7) return "soon";
  return "ok";
}
