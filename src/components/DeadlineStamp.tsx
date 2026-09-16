import { countdownLabel, formatDeadline, urgencyFor, type Urgency } from "@/lib/dates";

const URGENCY_CLASSES: Record<Urgency, string> = {
  none:    "text-ink-muted",
  ok:      "text-ink-muted",
  soon:    "font-bold text-tertiary",
  urgent:  "font-bold text-danger",
  overdue: "text-ink-faint line-through",
};

export function DeadlineStamp({
  deadline,
  muted,
}: {
  deadline: string | Date | null;
  /** True when the deadline no longer needs action (applied, decided…). */
  muted: boolean;
}) {
  const urgency = urgencyFor(deadline, muted);

  return (
    <div className="inline-flex items-center gap-1">
      <span className={`text-xs ${URGENCY_CLASSES[urgency]}`}>
        {formatDeadline(deadline)}
      </span>
      {urgency === "urgent" && (
        <span className="rounded border border-danger bg-danger-soft px-1 py-px text-[9px] font-bold text-danger">
          {countdownLabel(deadline)}
        </span>
      )}
      {urgency === "overdue" && (
        <span className="text-[9px] font-bold text-ink-faint">{countdownLabel(deadline)}</span>
      )}
      {urgency === "soon" && (
        <span
          className="rounded border border-tertiary bg-tertiary-soft px-1 py-px text-[9px] font-bold text-ink"
          title={countdownLabel(deadline) ?? ""}
        >
          {countdownLabel(deadline)}
        </span>
      )}
    </div>
  );
}
