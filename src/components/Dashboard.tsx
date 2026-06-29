"use client";

import { useMemo, useState } from "react";
import type { Opportunity } from "@/db/schema";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";
import { daysUntil } from "@/lib/dates";
import { StatsBar } from "./StatsBar";
import { DeadlineRail } from "./DeadlineRail";
import { OpportunityTable } from "./OpportunityTable";
import { AddEditPanel } from "./AddEditPanel";

type TypeFilter = "all" | "job" | "hackathon";

export function Dashboard({ initialData }: { initialData: Opportunity[] }) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Opportunity["status"]>("all");
  const [panel, setPanel] = useState<Opportunity | "new" | null>(null);

  const filtered = useMemo(() => {
    return initialData
      .filter((i) => typeFilter === "all" || i.type === typeFilter)
      .filter((i) => statusFilter === "all" || i.status === statusFilter)
      .sort((a, b) => {
        const da = daysUntil(a.deadline);
        const db = daysUntil(b.deadline);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
  }, [initialData, typeFilter, statusFilter]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Runway</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Every company and hackathon you&apos;re chasing, in one place.
          </p>
        </div>
        <button
          onClick={() => setPanel("new")}
          className="rounded-sm bg-amber px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
        >
          + Log opportunity
        </button>
      </header>

      <div className="mb-6">
        <StatsBar items={initialData} />
      </div>

      <div className="mb-6">
        <DeadlineRail items={initialData} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md border border-border p-1">
          {(["all", "job", "hackathon"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-sm px-3 py-1.5 text-xs capitalize transition-colors ${
                typeFilter === t ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {t === "all" ? "All" : t === "job" ? "Companies" : "Hackathons"}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-sm border border-border bg-surface px-3 py-1.5 text-xs text-ink-muted"
        >
          <option value="all">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <OpportunityTable items={filtered} onEdit={(item) => setPanel(item)} />

      {panel && <AddEditPanel editing={panel} onClose={() => setPanel(null)} />}
    </main>
  );
}
