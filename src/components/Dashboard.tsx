"use client";

import { useEffect, useMemo, useState } from "react";
import type { Opportunity, OpportunityWithUrls } from "@/db/schema";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";
import { daysUntil } from "@/lib/dates";
import { StatsBar } from "./StatsBar";
import { DeadlineRail } from "./DeadlineRail";
import { OpportunityTable } from "./OpportunityTable";
import { AddEditPanel } from "./AddEditPanel";

type TypeFilter = "all" | "job" | "hackathon";

const NAV = [
  { icon: "▦", label: "Tracker",    active: true },
  { icon: "▭", label: "Calendar",   active: false },
  { icon: "≡", label: "Statistics", active: false },
  { icon: "⚙", label: "Settings",   active: false },
] as const;

export function Dashboard({ initialData }: { initialData: OpportunityWithUrls[] }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [typeFilter, setTypeFilter]       = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter]   = useState<"all" | Opportunity["status"]>("all");
  const [searchQuery, setSearchQuery]     = useState("");
  const [showStaleOnly, setShowStaleOnly] = useState(false);
  const [dismissStale, setDismissStale]   = useState(false);
  const [dismissReview, setDismissReview] = useState(false);
  const [panel, setPanel]                 = useState<OpportunityWithUrls | "new" | null>(null);
  const [sidebarOpen, setSidebarOpen]     = useState(true);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("runway-theme") as "light" | "dark" | null;
    const initialTheme = storedTheme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("runway-theme", theme);
  }, [theme]);

  const staleItems = useMemo(() => {
    const nowMs = Date.now();
    return initialData.filter((i) => {
      if (i.status !== "applied") return false;
      return (nowMs - new Date(i.updatedAt).getTime()) / 86_400_000 >= 14;
    });
  }, [initialData]);

  const isReviewDay = useMemo(() => {
    const d = new Date().getDay();
    return d === 2 || d === 4; // Tue or Thu
  }, []);

  const filtered = useMemo(() =>
    initialData
      .filter((i) => typeFilter === "all" || i.type === typeFilter)
      .filter((i) => statusFilter === "all" || i.status === statusFilter)
      .filter((i) => !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter((i) => !showStaleOnly || staleItems.includes(i))
      .sort((a, b) => {
        const da = daysUntil(a.deadline);
        const db = daysUntil(b.deadline);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      }),
  [initialData, typeFilter, statusFilter, searchQuery, showStaleOnly, staleItems]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* ─── Sidebar ─── */}
      <aside
        className={`relative flex shrink-0 flex-col border-r-2 border-border bg-surface transition-all duration-200 ease-in-out ${
          sidebarOpen ? "w-44" : "w-14"
        }`}
      >
        {/* Toggle button — sits on the border edge */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="absolute -right-[13px] top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-border bg-bg-card text-[10px] font-extrabold text-ink shadow-hard-1 hover:bg-surface-2"
        >
          {sidebarOpen ? "‹" : "›"}
        </button>

        <div className={`flex flex-col flex-1 overflow-hidden p-3 ${sidebarOpen ? "items-start" : "items-center"}`}>
          {/* Branding */}
          <div className="mb-6 w-full">
            {sidebarOpen ? (
              <>
                <h1 className="text-xl font-extrabold tracking-tighter text-primary">Runway</h1>
                <p className="mt-1 text-[11px] font-medium leading-snug text-ink-muted">
                  Every opportunity.<br />One place.
                </p>
              </>
            ) : (
              <span className="block text-center text-xl font-extrabold tracking-tighter text-primary">R</span>
            )}
          </div>

          {/* CTA */}
          <button
            onClick={() => setPanel("new")}
            title="Log opportunity"
            className={`mb-6 rounded border-2 border-border bg-primary font-bold text-white shadow-hard-1 btn-push ${
              sidebarOpen
                ? "w-full px-3 py-2 text-sm"
                : "flex h-8 w-8 items-center justify-center text-base"
            }`}
          >
            {sidebarOpen ? "+ Log opportunity" : "+"}
          </button>

          {/* Nav */}
          <nav className="flex w-full flex-col gap-1">
            {NAV.map(({ icon, label, active }) => (
              <button
                key={label}
                title={!sidebarOpen ? label : undefined}
                className={`flex items-center rounded font-bold transition-colors ${
                  sidebarOpen ? "gap-2.5 px-3 py-2 text-sm" : "justify-center px-0 py-2 text-base w-full"
                } ${
                  active
                    ? "border-2 border-border bg-primary text-white shadow-hard-1"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <span className={sidebarOpen ? "text-xs opacity-70" : ""}>{icon}</span>
                {sidebarOpen && label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* ─── Main ─── */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            className="rounded border-2 border-border bg-bg-card px-3 py-2 text-xs font-extrabold uppercase tracking-[0.24em] text-ink shadow-hard-1 transition-colors hover:bg-surface"
          >
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>

        {/* Stats */}
        <div className="mb-5">
          <StatsBar items={initialData} />
        </div>

        {/* Deadline rail */}
        <div className="mb-4">
          <DeadlineRail items={initialData} />
        </div>

        {/* Stale banner */}
        {staleItems.length > 0 && !dismissStale && (
          <div className="mb-3 flex items-center justify-between rounded border-2 border-border bg-tertiary-soft px-4 py-2.5 shadow-hard-1-muted">
            <span className="flex items-center gap-2 text-sm font-bold text-ink">
              <span>⚠</span>
              {staleItems.length} applications haven&apos;t been updated in 14 days.
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowStaleOnly(true); setDismissStale(true); }}
                className="text-xs font-bold text-primary underline hover:no-underline"
              >
                View
              </button>
              <button onClick={() => setDismissStale(true)} className="font-bold text-ink-muted hover:text-ink">
                ×
              </button>
            </div>
          </div>
        )}

        {/* Review nudge */}
        {isReviewDay && !dismissReview && (
          <div className="mb-3 flex items-center justify-between rounded border-2 border-border bg-secondary-soft px-4 py-2.5 shadow-hard-1-muted">
            <span className="flex items-center gap-2 text-sm font-bold text-secondary">
              <span>📅</span>
              It&apos;s {new Date().toLocaleDateString("en", { weekday: "long" })}! Time for your weekly runway review →
            </span>
            <button onClick={() => setDismissReview(true)} className="font-bold text-secondary/60 hover:text-secondary">
              ×
            </button>
          </div>
        )}

        {/* Search + filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search opportunities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-w-[200px] flex-1 rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-2 outline-none placeholder:text-ink-faint focus:bg-primary-soft"
          />

          {/* Type toggle */}
          <div className="flex gap-px overflow-hidden rounded border-2 border-border bg-surface shadow-hard-1">
            {(["all", "job", "hackathon"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  typeFilter === t ? "bg-primary text-white" : "bg-bg-card text-ink-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {t === "all" ? "All" : t === "job" ? "Jobs" : "Hackathons"}
              </button>
            ))}
          </div>

          {/* Status select */}
          <div className="flex items-center gap-2">
            {showStaleOnly && (
              <button
                onClick={() => setShowStaleOnly(false)}
                className="rounded border-2 border-tertiary bg-tertiary px-3 py-2 text-xs font-bold text-ink shadow-hard-1 btn-push-sm"
              >
                Stale only ×
              </button>
            )}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded border-2 border-border bg-bg-card px-3 py-2 text-xs font-bold text-ink shadow-hard-1 outline-none"
            >
              <option value="all">All Statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <OpportunityTable
          items={filtered}
          onEdit={(item) => setPanel(item)}
          onAdd={() => setPanel("new")}
        />
      </main>

      {/* Modal */}
      {panel && <AddEditPanel editing={panel} onClose={() => setPanel(null)} />}

      {/* Floating Action Button */}
      <button
        onClick={() => setPanel("new")}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-border bg-primary text-3xl font-extrabold text-white shadow-hard-2 btn-push"
        aria-label="Log opportunity"
      >
        +
      </button>
    </div>
  );
}
