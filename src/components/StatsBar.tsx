import { STATUS_LABEL, STATUS_COLOR } from "@/lib/constants";
import type { OpportunityWithUrls } from "@/db/schema";

const STAT_STATUSES = ["found", "applied", "oa_assignment", "in_progress"] as const;

export function StatsBar({ items }: { items: OpportunityWithUrls[] }) {
  const totalApplied = items.filter((i) => !["found", "hackathon_active"].includes(i.status)).length;
  const totalResponses = items.filter((i) =>
    ["oa_assignment", "in_progress", "selected"].includes(i.status)
  ).length;
  const responseRate = totalApplied > 0 ? (totalResponses / totalApplied) * 100 : 0;

  const now = Date.now();
  const staleCount = items.filter((i) => {
    if (i.status !== "applied") return false;
    return (now - new Date(i.updatedAt).getTime()) / 86_400_000 >= 14;
  }).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {STAT_STATUSES.map((status) => {
          const count = items.filter((i) => i.status === status).length;
          return (
            <div
              key={status}
              style={{ backgroundColor: STATUS_COLOR[status] }}
              className="flex min-w-[110px] flex-1 flex-col gap-1 rounded-2xl border-2 border-border bg-opacity-90 p-4 shadow-hard-2"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink/70">
                {STATUS_LABEL[status]}
              </p>
              <p className="text-4xl font-extrabold leading-none tracking-tighter text-ink">
                {count}
              </p>
            </div>
          );
        })}
      </div>

      {/* Response rate + stale */}
      <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
        <div className="rounded border-2 border-border bg-bg-card px-3 py-1.5 shadow-hard-1-muted">
          <span className="text-ink-muted">Response rate: </span>
          <span className="text-ink">
            {totalResponses}/{totalApplied} ({Math.round(responseRate)}%)
          </span>
        </div>
        {staleCount > 0 && (
          <div className="rounded border-2 border-danger bg-danger-soft px-3 py-1.5 text-danger shadow-hard-1-muted">
            ⚠ {staleCount} stale — no update in 14+ days
          </div>
        )}
        {totalApplied > 10 && responseRate < 20 && (
          <div className="rounded border-2 border-tertiary bg-tertiary-soft px-3 py-1.5 text-ink shadow-hard-1-muted">
            💡 Low response rate — try tailoring your resume per application
          </div>
        )}
      </div>
    </div>
  );
}
