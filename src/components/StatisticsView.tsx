"use client";

import type { OpportunityWithUrls } from "@/db/schema";
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";

export function StatisticsView({ items }: { items: OpportunityWithUrls[] }) {
  const total = items.length;
  
  const byStatus = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const appliedCount = (byStatus["applied"] || 0) + (byStatus["oa_assignment"] || 0) + (byStatus["in_progress"] || 0) + (byStatus["selected"] || 0) + (byStatus["rejected"] || 0);
  
  const interviewCount = (byStatus["oa_assignment"] || 0) + (byStatus["in_progress"] || 0) + (byStatus["selected"] || 0) + (byStatus["rejected"] || 0);

  const offerCount = byStatus["selected"] || 0;

  const StatCard = ({ title, value, sub }: { title: string, value: string | number, sub?: string }) => (
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

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full pb-10">
      <div className="flex items-center justify-between border-b-4 border-border pb-4">
        <h2 className="text-3xl font-black uppercase tracking-tighter text-ink">
          Overview Statistics
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Tracked" 
          value={total} 
        />
        <StatCard 
          title="Applications" 
          value={appliedCount} 
          sub={`${total > 0 ? ((appliedCount / total) * 100).toFixed(1) : 0}% of tracked`} 
        />
        <StatCard 
          title="Interviews / OA" 
          value={interviewCount} 
          sub={`${appliedCount > 0 ? ((interviewCount / appliedCount) * 100).toFixed(1) : 0}% of applied`} 
        />
        <StatCard 
          title="Offers / Selected" 
          value={offerCount} 
          sub={`${appliedCount > 0 ? ((offerCount / appliedCount) * 100).toFixed(1) : 0}% of applied`} 
        />
      </div>

      <div className="rounded-2xl border-2 border-border bg-surface p-6 shadow-hard-2">
        <h3 className="mb-6 text-lg font-black uppercase tracking-widest text-ink border-b-2 border-border pb-2">
          Pipeline Breakdown
        </h3>
        <div className="flex flex-col gap-4">
          {STATUS_ORDER.map(status => {
            const count = byStatus[status] || 0;
            const percentage = total > 0 ? (count / total) * 100 : 0;
            const color = STATUS_COLOR[status];
            const label = STATUS_LABEL[status];

            return (
              <div key={status} className="flex items-center gap-2 sm:gap-4 group">
                <div className="w-24 sm:w-32 shrink-0 text-right text-[10px] sm:text-xs font-bold uppercase tracking-widest text-ink">
                  {label}
                </div>
                <div className="flex-1 h-6 rounded-full border-2 border-border bg-bg-card overflow-hidden shadow-inner">
                  <div 
                    className="h-full border-r-2 border-border transition-all duration-1000 ease-out flex items-center justify-end pr-2" 
                    style={{ width: `${Math.max(percentage, count > 0 ? 5 : 0)}%`, backgroundColor: color }}
                  >
                  </div>
                </div>
                <div className="w-10 sm:w-12 shrink-0 text-left text-sm font-black text-ink">
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
