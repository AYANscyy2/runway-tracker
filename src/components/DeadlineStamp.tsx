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
  isTerminal,
}: {
  deadline: string | Date | null;
  isTerminal: boolean;
}) {
  const urgency = urgencyFor(deadline, isTerminal);

  return (
    <div className="inline-flex items-center gap-1">
      <span className={`text-xs ${URGENCY_CLASSES[urgency]}`}>
        {formatDeadline(deadline)}
      </span>
      {urgency === "urgent" && (
        <span className="text-[10px] text-danger" title="Action required soon">⚑</span>
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
