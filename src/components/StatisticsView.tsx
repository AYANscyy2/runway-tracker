"use client";

import { useState } from "react";
import type { OpportunityWithUrls } from "@/db/schema";
import { STATUS_COLOR, STATUS_FOR_TYPE, STATUS_LABEL, type OppType, type Status } from "@/lib/constants";

// Defined at module scope: a component created inside render is a new type on
// every pass, so React remounts it and loses its DOM state.
function StatCard({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-2xl border-2 border-border bg-bg-card p-4 shadow-hard-2 transition-transform hover:-translate-y-1">
      <h3 className="text-xs font-extrabold uppercase tracking-widest text-ink-muted">{title}</h3>
      <p className="text-4xl sm:text-5xl font-black text-ink">{value}</p>
      {sub ? (
        <p className="text-xs font-bold text-ink-muted bg-surface inline-block px-2 py-1 rounded border-2 border-border self-start mt-2">
          {sub}
        </p>
      ) : (
        <div className="h-6 mt-2" />
      )}
    </div>
  );
}

/**
 * The funnel, per kind. Only the current status is stored, so each stage
 * counts entries that are *at or past* it — and "rejected" only counts toward
 * stages it necessarily passed. A job can be rejected straight after applying,
 * so a rejection is an application but not an interview; counting it as one
 * made the interview rate look better the more you were turned down.
 */
const FUNNEL: Record<OppType, { title: string; statuses: Status[]; of: "total" | "prev" }[]> = {
  job: [
    { title: "Applications", statuses: ["applied", "oa_assignment", "in_progress", "selected", "rejected"], of: "total" },
    { title: "Interviews / OA", statuses: ["oa_assignment", "in_progress", "selected"], of: "prev" },
    { title: "Offers", statuses: ["selected"], of: "prev" },
  ],
  hackathon: [
    { title: "Registered", statuses: ["applied", "hackathon_active", "selected", "rejected"], of: "total" },
    { title: "Taking part", statuses: ["hackathon_active", "selected"], of: "prev" },
    { title: "Won / selected", statuses: ["selected"], of: "prev" },
  ],
};

const pct = (n: number, d: number) => `${d > 0 ? ((n / d) * 100).toFixed(1) : 0}%`;

export function StatisticsView({ items, onAdd }: { items: OpportunityWithUrls[]; onAdd?: () => void }) {
  // Jobs and hackathons have different funnels; mixing them added hackathon
  // wins to job offers. Opens on whichever kind you track more of.
  const [kind, setKind] = useState<OppType>(() =>
    items.filter((i) => i.type === "hackathon").length > items.filter((i) => i.type === "job").length ? "hackathon" : "job",
  );

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-16 text-center">
        <p className="text-base font-extrabold text-ink">No numbers yet</p>
        <p className="max-w-sm text-sm text-ink-muted">Once you&apos;ve logged a few opportunities you&apos;ll see your funnel — applied → interviews → offers — here.</p>
        {onAdd && (
          <button onClick={onAdd} className="mt-2 rounded border-2 border-border bg-primary px-5 py-2 text-sm font-bold text-white shadow-hard-1 btn-push">
            + Log opportunity
          </button>
        )}
      </div>
    );
  }

  const ofKind = items.filter((i) => i.type === kind);
  const total = ofKind.length;
  const byStatus = ofKind.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Partial<Record<Status, number>>);
  const count = (statuses: Status[]) => statuses.reduce((n, s) => n + (byStatus[s] ?? 0), 0);

  const stages = FUNNEL[kind].map((stage) => ({ ...stage, value: count(stage.statuses) }));
  // A status that isn't valid for this kind (legacy data) still shows, so the
  // breakdown always adds up to the total.
  const statuses = [
    ...STATUS_FOR_TYPE[kind],
    ...(Object.keys(byStatus) as Status[]).filter((s) => !STATUS_FOR_TYPE[kind].includes(s)),
  ];

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full pb-10">
      <div className="flex gap-px self-start overflow-hidden rounded border-2 border-border bg-surface shadow-hard-1">
        {(["job", "hackathon"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              kind === k ? "bg-primary text-white" : "bg-bg-card text-ink-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {k === "job" ? "Jobs" : "Hackathons"} {items.filter((i) => i.type === k).length}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-border px-6 py-12 text-center text-sm font-bold text-ink-muted">
          No {kind === "job" ? "jobs" : "hackathons"} logged yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Tracked" value={total} />
            {stages.map((stage, i) => (
              <StatCard
                key={stage.title}
                title={stage.title}
                value={stage.value}
                sub={stage.of === "total"
                  ? `${pct(stage.value, total)} of tracked`
                  : `${pct(stage.value, stages[i - 1].value)} of ${stages[i - 1].title.toLowerCase()}`}
              />
            ))}
          </div>

          <div className="rounded-2xl border-2 border-border bg-surface p-6 shadow-hard-2">
            <h3 className="mb-6 text-lg font-black uppercase tracking-widest text-ink border-b-2 border-border pb-2">
              Pipeline Breakdown
            </h3>
            <div className="flex flex-col gap-4">
              {statuses.map((status) => {
                const n = byStatus[status] ?? 0;
                const percentage = total > 0 ? (n / total) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-2 sm:gap-4 group">
                    <div className="w-24 sm:w-32 shrink-0 text-right text-[10px] sm:text-xs font-bold uppercase tracking-widest text-ink">
                      {STATUS_LABEL[status]}
                    </div>
                    <div className="flex-1 h-6 rounded-full border-2 border-border bg-bg-card overflow-hidden shadow-inner">
                      <div
                        className="h-full border-r-2 border-border transition-all duration-1000 ease-out flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(percentage, n > 0 ? 5 : 0)}%`, backgroundColor: STATUS_COLOR[status] }}
                      />
                    </div>
                    <div className="w-10 sm:w-12 shrink-0 text-left text-sm font-black text-ink">
                      {n}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
