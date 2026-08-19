"use client";

import type { OpportunityWithUrls } from "@/db/schema";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/constants";

export function NotificationsView({ 
  items, 
  onItemClick 
}: { 
  items: OpportunityWithUrls[],
  onItemClick?: (item: OpportunityWithUrls) => void
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdue: { item: OpportunityWithUrls; type: string; date: Date }[] = [];
  const todayItems: { item: OpportunityWithUrls; type: string; date: Date }[] = [];
  const upcoming: { item: OpportunityWithUrls; type: string; date: Date }[] = [];

  items.forEach(item => {
    if (item.status === "selected" || item.status === "rejected") return;

    const checkDate = (dateStr: string | null, type: string) => {
      if (!dateStr) return;
      const targetDate = new Date(dateStr);
      targetDate.setHours(0, 0, 0, 0);

      const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      const record = { item, type, date: targetDate };

      if (diffDays < 0) {
        overdue.push(record);
      } else if (diffDays === 0) {
        todayItems.push(record);
      } else if (diffDays <= 14) {
        upcoming.push(record);
      }
    };

    checkDate(item.deadline, "Deadline");
    checkDate(item.followUpDate, "Follow-up");
  });

  const sortFn = (a: any, b: any) => a.date.getTime() - b.date.getTime();
  overdue.sort(sortFn);
  todayItems.sort(sortFn);
  upcoming.sort(sortFn);

  const renderSection = (title: string, records: any[], emptyMessage: string, badgeColor: string) => (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-bg-card p-4 shadow-hard-2 mb-6">
      <div className="flex items-center gap-2 border-b-2 border-border pb-3">
        <h2 className="text-xl font-extrabold tracking-tighter text-ink uppercase">
          {title}
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-sm`} style={{ backgroundColor: badgeColor }}>
          {records.length}
        </span>
      </div>

      {records.length === 0 ? (
        <p className="py-4 text-center text-sm font-bold text-ink-muted">
          {emptyMessage}
        </p>
      ) : (
        <div className="flex flex-col gap-3 pt-2">
          {records.map((record, i) => (
            <div
              key={`${record.item.id}-${record.type}-${i}`}
              onClick={() => onItemClick?.(record.item)}
              className="group flex cursor-pointer items-center justify-between gap-4 rounded-xl border-2 border-border bg-surface p-3 shadow-hard-1 transition-all hover:-translate-y-0.5 hover:shadow-hard-2"
            >
              <div className="flex flex-col gap-1 overflow-hidden">
                <div className="flex items-center gap-2">
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-ink shadow-sm"
                    style={{ backgroundColor: STATUS_COLOR[record.item.status as keyof typeof STATUS_COLOR] }}
                  >
                    {STATUS_LABEL[record.item.status as keyof typeof STATUS_LABEL]}
                  </span>
                  <span className="text-xs font-bold text-ink-muted uppercase tracking-wider shrink-0 border-l-2 border-border pl-2">
                    {record.type}
                  </span>
                </div>
                <p className="truncate text-base font-extrabold text-ink group-hover:text-primary transition-colors">
                  {record.item.name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-ink-muted">
                  {record.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2 max-w-4xl mx-auto w-full">
      {renderSection("Due Today", todayItems, "Nothing due today! Relax.", "var(--color-status-selected)")}
      {renderSection("Overdue", overdue, "All caught up! No overdue tasks.", "var(--color-status-rejected)")}
      {renderSection("Upcoming (Next 14 Days)", upcoming, "No upcoming deadlines in the next two weeks.", "var(--color-primary)")}
    </div>
  );
}
