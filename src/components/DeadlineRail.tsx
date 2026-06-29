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
    <div className="rounded-md border border-amber/30 bg-amber-soft p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-amber">
        Next 7 days — don&apos;t let these slip
      </p>
      <ul className="flex flex-col gap-2">
        {upcoming.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-ink">{item.name}</span>
            <DeadlineStamp deadline={item.deadline} isTerminal={false} />
          </li>
        ))}
      </ul>
    </div>
  );
}
