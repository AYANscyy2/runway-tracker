import { STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";
import type { Opportunity } from "@/db/schema";

export function StatsBar({ items }: { items: Opportunity[] }) {
  const total = items.length;

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-6">
      <div className="flex flex-col gap-1 bg-surface px-4 py-3">
        <span className="font-mono text-2xl text-ink">{total}</span>
        <span className="text-xs text-ink-muted">Total logged</span>
      </div>
      {STATUS_ORDER.map((status) => {
        const count = items.filter((i) => i.status === status).length;
        return (
          <div key={status} className="flex flex-col gap-1 bg-surface px-4 py-3">
            <span className="font-mono text-2xl text-ink">{count}</span>
            <span className="text-xs text-ink-muted">{STATUS_LABEL[status]}</span>
          </div>
        );
      })}
    </div>
  );
}
