import { daysUntil } from "@/lib/dates";
import { TERMINAL_STATUSES } from "@/lib/constants";
import type { Opportunity } from "@/db/schema";
import { DeadlineStamp } from "./DeadlineStamp";

export function DeadlineRail({ items }: { items: Opportunity[] }) {
  const upcoming = items
    .filter((i) => i.deadline && !TERMINAL_STATUSES.includes(i.status))
    .filter((i) => {
      const d = daysUntil(i.deadline);
      return d !== null && d <= 7;
    })
    .sort((a, b) => (daysUntil(a.deadline) ?? 0) - (daysUntil(b.deadline) ?? 0));

  if (upcoming.length === 0) return null;

  return (
    <div className="rounded-lg border-2 border-border bg-tertiary-soft p-4 shadow-hard-1-muted backdrop-blur-sm">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-tertiary">
        ⏰ Next 7 days — don&apos;t let these slip
      </p>
      <ul className="flex flex-col divide-y-2 divide-border/20">
        {upcoming.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="truncate font-bold text-ink">{item.name}</span>
            <DeadlineStamp deadline={item.deadline} isTerminal={false} />
          </li>
        ))}
      </ul>
    </div>
  );
}
