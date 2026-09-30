"use client";

import type { OpportunityWithUrls } from "@/db/schema";
import { STATUS_COLOR, STATUS_LABEL, TERMINAL_STATUSES, deadlineMatters } from "@/lib/constants";
import { countdownLabel, daysUntil, formatDeadline } from "@/lib/dates";

/** One dated thing that needs attention: a deadline or a follow-up. */
type AgendaRecord = { item: OpportunityWithUrls; kind: "Deadline" | "Follow-up"; date: string; days: number };

const HORIZON_DAYS = 14;

export function NotificationsView({
  items,
  onItemClick,
}: {
  items: OpportunityWithUrls[];
  onItemClick?: (item: OpportunityWithUrls) => void;
}) {
  const overdue: AgendaRecord[] = [];
  const today: AgendaRecord[] = [];
  const upcoming: AgendaRecord[] = [];

  for (const item of items) {
    if (TERMINAL_STATUSES.includes(item.status)) continue;
    const add = (date: string | null, kind: AgendaRecord["kind"]) => {
      const days = daysUntil(date);
      if (date === null || days === null || days > HORIZON_DAYS) return;
      const record = { item, kind, date, days };
      if (days < 0) overdue.push(record);
      else if (days === 0) today.push(record);
      else upcoming.push(record);
    };
    if (deadlineMatters(item.type, item.status)) add(item.deadline, "Deadline");
    add(item.followUpDate, "Follow-up");
  }

  const byDate = (a: AgendaRecord, b: AgendaRecord) => a.days - b.days;
  overdue.sort(byDate);
  today.sort(byDate);
  upcoming.sort(byDate);

  const total = overdue.length + today.length + upcoming.length;
  if (total === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <p className="rounded-lg border-2 border-dashed border-border px-4 py-12 text-center text-sm font-bold text-ink-muted">
          Nothing needs your attention in the next two weeks. Nice.
        </p>
      </div>
    );
  }

  // Most urgent first: what you've already missed, then today, then the horizon.
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-6">
      <Section title="Overdue" records={overdue} empty="Nothing overdue." badge="var(--color-status-rejected)" onItemClick={onItemClick} />
      <Section title="Due today" records={today} empty="Nothing due today." badge="var(--color-status-selected)" onItemClick={onItemClick} />
      <Section title={`Next ${HORIZON_DAYS} days`} records={upcoming} empty="Nothing coming up." badge="var(--color-primary)" onItemClick={onItemClick} />
    </div>
  );
}

function Section({
  title, records, empty, badge, onItemClick,
}: {
  title: string;
  records: AgendaRecord[];
  empty: string;
  badge: string;
  onItemClick?: (item: OpportunityWithUrls) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border-2 border-border bg-bg-card p-4 shadow-hard-2">
      <div className="flex items-center gap-2 border-b-2 border-border pb-3">
        <h2 className="text-lg font-extrabold uppercase tracking-tight text-ink">{title}</h2>
        <span className="rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: badge }}>
          {records.length}
        </span>
      </div>

      {records.length === 0 ? (
        <p className="py-3 text-center text-sm font-bold text-ink-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3 pt-1">
          {records.map((r) => (
            <li key={`${r.item.id}-${r.kind}`}>
              <button
                type="button"
                onClick={() => onItemClick?.(r.item)}
                className="group flex w-full items-center justify-between gap-4 rounded-lg border-2 border-border bg-surface p-3 text-left shadow-hard-1 transition-all hover:-translate-y-0.5 hover:shadow-hard-2"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-ink"
                      style={{ backgroundColor: STATUS_COLOR[r.item.status] }}
                    >
                      {STATUS_LABEL[r.item.status]}
                    </span>
                    <span className="shrink-0 border-l-2 border-border pl-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
                      {r.kind}
                    </span>
                  </div>
                  <p className="truncate text-base font-extrabold text-ink transition-colors group-hover:text-primary">
                    {r.item.name}
                  </p>
                  {r.item.nextAction && (
                    <p className="truncate text-xs text-ink-muted">{r.item.nextAction}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-ink">{formatDeadline(r.date)}</p>
                  <p className={`text-2xs font-bold ${r.days < 0 ? "text-danger" : "text-ink-muted"}`}>
                    {countdownLabel(r.date)}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
