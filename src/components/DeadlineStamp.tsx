import { countdownLabel, formatDeadline, urgencyFor, type Urgency } from "@/lib/dates";

const URGENCY_CLASSES: Record<Urgency, string> = {
  none: "border-border text-ink-muted",
  ok: "border-border text-ink-muted",
  soon: "border-amber/40 text-amber",
  urgent: "border-amber text-amber bg-amber-soft",
  overdue: "border-danger text-danger bg-danger-soft",
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
    <div className="inline-flex flex-col items-start gap-0.5">
      <span className="font-mono text-xs text-ink-muted">{formatDeadline(deadline)}</span>
      {deadline && (
        <span
          className={`rounded-sm border px-1.5 py-0.5 font-mono text-[11px] leading-none ${URGENCY_CLASSES[urgency]}`}
        >
          {countdownLabel(deadline)}
        </span>
      )}
    </div>
  );
}
