"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { OpportunityWithUrls } from "@/db/schema";
import {
  STALE_AFTER_DAYS,
  STATUS_FOR_TYPE,
  STATUS_LABEL,
  STATUS_ORDER,
  TERMINAL_STATUSES,
  deadlineMatters,
  type Status,
} from "@/lib/constants";
import { daysUntil } from "@/lib/dates";
import { deleteOpportunity } from "@/app/actions";
import { OpportunityTable } from "./OpportunityTable";
import { AddEditPanel } from "./AddEditPanel";
import { CalendarView } from "./CalendarView";
import { NotificationsView } from "./NotificationsView";
import { StatisticsView } from "./StatisticsView";
import { SettingsView } from "./SettingsView";
import { UserMenu } from "./UserMenu";
import { useToast } from "./Toast";
import { IconBell, IconCalendar, IconChart, IconGear, IconGrid } from "./Icons";

type TypeFilter = "all" | "job" | "hackathon";
type StatusFilter = "all" | Status;
type QuickFilter = "" | "stale" | "overdue";
type Tab = "tracker" | "calendar" | "agenda" | "stats" | "settings";

const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "tracker",  label: "Tracker",    icon: <IconGrid /> },
  { id: "calendar", label: "Calendar",   icon: <IconCalendar /> },
  { id: "agenda",   label: "Agenda",     icon: <IconBell /> },
  { id: "stats",    label: "Statistics", icon: <IconChart /> },
  { id: "settings", label: "Settings",   icon: <IconGear /> },
];

const TABS: Tab[] = NAV.map((n) => n.id);
const UNDO_MS = 6000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

type ViewState = { tab: string; type: string; status: string; q: string; quick: string };
const VIEW_KEYS = ["tab", "type", "status", "q", "quick"] as const;

export function Dashboard({ initialData }: { initialData: OpportunityWithUrls[] }) {
  const params = useSearchParams();
  const toast = useToast();

  // ── View state: React owns it, the URL mirrors it (shareable / reload-safe) ──
  const [view, setView] = useState<ViewState>(() =>
    Object.fromEntries(VIEW_KEYS.map((k) => [k, params.get(k) ?? ""])) as ViewState,
  );
  const setParams = useCallback((patch: Partial<ViewState>) => {
    setView((v) => {
      const next = { ...v, ...patch };
      const url = new URL(window.location.href);
      for (const k of VIEW_KEYS) {
        if (next[k]) url.searchParams.set(k, next[k]);
        else url.searchParams.delete(k);
      }
      window.history.replaceState(window.history.state, "", url);
      return next;
    });
  }, []);

  const activeTab: Tab = TABS.includes(view.tab as Tab) ? (view.tab as Tab) : "tracker";
  const typeFilter = (view.type as TypeFilter) || "all";
  const statusFilter = (view.status as StatusFilter) || "all";
  const searchQuery = view.q;
  const quick = (view.quick as QuickFilter) || "";
  const searchRef = useRef<HTMLInputElement>(null);

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [panel, setPanel] = useState<OpportunityWithUrls | "new" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dismissedStrip, setDismissedStrip] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Theme attribute is already set by the inline script in layout.tsx; just read it.
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark" || t === "light") setTheme(t);
  }, []);
  const applyTheme = useCallback((t: "light" | "dark") => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    try { window.localStorage.setItem("runway-theme", t); } catch {}
  }, []);

  useEffect(() => {
    try { setDismissedStrip(window.localStorage.getItem("runway-strip-dismissed") === todayKey()); } catch {}
  }, []);
  function dismissStrip() {
    setDismissedStrip(true);
    try { window.localStorage.setItem("runway-strip-dismissed", todayKey()); } catch {}
  }

  // ── Derived sets ─────────────────────────────────────────────────
  const visible = useMemo(
    () => initialData.filter((i) => !pendingDelete.has(i.id)),
    [initialData, pendingDelete],
  );

  const staleItems = useMemo(() => {
    const nowMs = Date.now();
    return visible.filter(
      (i) => i.status === "applied" && (nowMs - new Date(i.updatedAt).getTime()) / 86_400_000 >= STALE_AFTER_DAYS,
    );
  }, [visible]);

  const overdueItems = useMemo(
    () => visible.filter((i) => deadlineMatters(i.type, i.status) && (daysUntil(i.deadline) ?? 1) < 0),
    [visible],
  );

  const agendaCount = useMemo(
    () =>
      visible.filter((i) => {
        if (TERMINAL_STATUSES.includes(i.status)) return false;
        const d = deadlineMatters(i.type, i.status) ? daysUntil(i.deadline) : null;
        const f = daysUntil(i.followUpDate);
        return (d !== null && d <= 0) || (f !== null && f <= 0);
      }).length,
    [visible],
  );

  const isReviewDay = useMemo(() => [2, 4].includes(new Date().getDay()), []);

  const statusOptions = typeFilter === "all" ? STATUS_ORDER : STATUS_FOR_TYPE[typeFilter];

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visible
      .filter((i) => typeFilter === "all" || i.type === typeFilter)
      .filter((i) => statusFilter === "all" || i.status === statusFilter)
      .filter((i) => {
        if (!q) return true;
        return [i.name, i.source, i.referralContact, i.nextAction, i.notes]
          .some((v) => v?.toLowerCase().includes(q));
      })
      .filter((i) => {
        if (quick === "stale") return staleItems.includes(i);
        if (quick === "overdue") return overdueItems.includes(i);
        return true;
      });
  }, [visible, typeFilter, statusFilter, searchQuery, quick, staleItems, overdueItems]);

  // ── Delete with undo ─────────────────────────────────────────────
  const requestDelete = useCallback((item: OpportunityWithUrls) => {
    setPendingDelete((s) => new Set(s).add(item.id));
    setPanel(null);
    const timer = setTimeout(async () => {
      deleteTimers.current.delete(item.id);
      const res = await deleteOpportunity(item.id);
      if (!res.ok) {
        setPendingDelete((s) => { const n = new Set(s); n.delete(item.id); return n; });
        toast.push({ message: `Couldn't delete: ${res.error}`, tone: "danger" });
      }
    }, UNDO_MS);
    deleteTimers.current.set(item.id, timer);
    toast.push({
      message: `Removed ${item.name}`,
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const t = deleteTimers.current.get(item.id);
          if (t) clearTimeout(t);
          deleteTimers.current.delete(item.id);
          setPendingDelete((s) => { const n = new Set(s); n.delete(item.id); return n; });
        },
      },
    });
  }, [toast]);

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (panel) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n") { e.preventDefault(); setPanel("new"); }
      if (e.key === "/") { e.preventDefault(); setParams({ tab: "" }); searchRef.current?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, setParams]);

  const goTab = (t: Tab) => setParams({ tab: t === "tracker" ? "" : t });

  const stripLines: { text: string; cta?: { label: string; onClick: () => void } }[] = [];
  if (overdueItems.length > 0)
    stripLines.push({
      text: `${overdueItems.length} deadline${overdueItems.length > 1 ? "s have" : " has"} passed — update their status or drop them.`,
      cta: { label: "Clean up", onClick: () => setParams({ tab: "", quick: "overdue" }) },
    });
  if (staleItems.length > 0)
    stripLines.push({
      text: `${staleItems.length} application${staleItems.length > 1 ? "s haven't" : " hasn't"} moved in ${STALE_AFTER_DAYS} days.`,
      cta: { label: "Review", onClick: () => setParams({ tab: "", quick: "stale" }) },
    });
  if (isReviewDay)
    stripLines.push({
      text: `It's ${new Date().toLocaleDateString("en", { weekday: "long" })} — time for your weekly runway review.`,
      cta: { label: "Open agenda", onClick: () => goTab("agenda") },
    });

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* ─── Sidebar ─── */}
      <aside
        className={`relative flex shrink-0 flex-col border-r-2 border-border bg-surface transition-all duration-200 ease-in-out ${
          sidebarOpen ? "w-44" : "w-14"
        }`}
      >
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="absolute -right-[13px] top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-border bg-bg-card text-[10px] font-extrabold text-ink shadow-hard-1 hover:bg-surface-2"
        >
          {sidebarOpen ? "‹" : "›"}
        </button>

        <div className={`flex flex-1 flex-col overflow-hidden p-3 ${sidebarOpen ? "items-start" : "items-center"}`}>
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

          <button
            onClick={() => setPanel("new")}
            title="Log opportunity (n)"
            className={`mb-6 rounded border-2 border-border bg-primary font-bold text-white shadow-hard-1 btn-push ${
              sidebarOpen ? "w-full px-3 py-2 text-sm" : "flex h-8 w-8 items-center justify-center text-base"
            }`}
          >
            {sidebarOpen ? "+ Log opportunity" : "+"}
          </button>

          <nav className="flex w-full flex-col gap-1">
            {NAV.map(({ id, icon, label }) => {
              const active = activeTab === id;
              const badge = id === "agenda" ? agendaCount : 0;
              return (
                <button
                  key={id}
                  onClick={() => goTab(id)}
                  title={!sidebarOpen ? label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center rounded font-bold transition-colors ${
                    sidebarOpen ? "gap-2.5 px-3 py-2 text-sm" : "w-full justify-center px-0 py-2 text-base"
                  } ${active ? "border-2 border-border bg-primary text-white shadow-hard-1" : "text-ink-muted hover:bg-surface-2 hover:text-ink"}`}
                >
                  <span className={`flex items-center ${sidebarOpen ? "text-sm opacity-80" : ""}`}>{icon}</span>
                  {sidebarOpen && <span className="flex-1 text-left">{label}</span>}
                  {badge > 0 && (
                    <span
                      className={`flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-border px-1 text-[10px] font-extrabold ${
                        active ? "bg-bg-card text-primary" : "bg-danger text-white"
                      } ${sidebarOpen ? "" : "absolute -right-0.5 -top-0.5 h-4 min-w-4 text-[9px]"}`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* ─── Main ─── */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-extrabold tracking-tight text-ink">
            {NAV.find((n) => n.id === activeTab)?.label}
          </h2>
          <UserMenu
            theme={theme}
            onToggleTheme={() => applyTheme(theme === "dark" ? "light" : "dark")}
            onOpenSettings={() => goTab("settings")}
          />
        </div>

        {/* One attention strip instead of stacked banners */}
        {activeTab === "tracker" && stripLines.length > 0 && !dismissedStrip && (
          <div className="mb-4 rounded border-2 border-border bg-tertiary-soft px-4 py-2.5 shadow-hard-1-muted">
            <div className="flex items-start justify-between gap-3">
              <ul className="flex flex-col gap-1.5 text-sm font-bold text-ink">
                {stripLines.map((l) => (
                  <li key={l.text} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{l.text}</span>
                    {l.cta && (
                      <button onClick={l.cta.onClick} className="text-xs font-extrabold uppercase tracking-wider text-primary underline hover:no-underline">
                        {l.cta.label} →
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <button onClick={dismissStrip} aria-label="Dismiss for today" className="font-bold text-ink-muted hover:text-ink">×</button>
            </div>
          </div>
        )}

        {activeTab === "tracker" && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                ref={searchRef}
                type="search"
                placeholder="Search name, source, notes…  ( / )"
                value={searchQuery}
                onChange={(e) => setParams({ q: e.target.value })}
                className="min-w-[200px] flex-1 rounded border-2 border-border bg-bg-card px-3 py-2 text-sm font-medium text-ink shadow-hard-2 outline-none placeholder:text-ink-faint focus:bg-primary-soft"
              />

              <div className="flex gap-px overflow-hidden rounded border-2 border-border bg-surface shadow-hard-1">
                {(["all", "job", "hackathon"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      // Drop a status that no longer applies to the chosen type.
                      const keep = t === "all" || statusFilter === "all" || STATUS_FOR_TYPE[t].includes(statusFilter);
                      setParams({ type: t === "all" ? "" : t, status: keep ? statusFilter === "all" ? "" : statusFilter : "" });
                    }}
                    className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                      typeFilter === t ? "bg-primary text-white" : "bg-bg-card text-ink-muted hover:bg-surface hover:text-ink"
                    }`}
                  >
                    {t === "all" ? "All" : t === "job" ? "Jobs" : "Hackathons"}
                  </button>
                ))}
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setParams({ status: e.target.value === "all" ? "" : e.target.value })}
                className="rounded border-2 border-border bg-bg-card px-3 py-2 text-xs font-bold text-ink shadow-hard-1 outline-none"
              >
                <option value="all">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>

              {quick && (
                <button
                  onClick={() => setParams({ quick: "" })}
                  className="rounded border-2 border-tertiary bg-tertiary-soft px-3 py-2 text-xs font-bold text-ink shadow-hard-1 btn-push-sm"
                >
                  {quick === "stale" ? "Stale only" : "Overdue only"} ×
                </button>
              )}
            </div>

            <OpportunityTable
              items={filtered}
              totalCount={visible.length}
              onEdit={(item) => setPanel(item)}
              onAdd={() => setPanel("new")}
              onClearFilters={() => setParams({ q: "", type: "", status: "", quick: "" })}
            />
          </>
        )}

        {activeTab === "calendar" && <CalendarView items={visible} onItemClick={(item) => setPanel(item)} onAdd={() => setPanel("new")} />}
        {activeTab === "agenda" && <NotificationsView items={visible} onItemClick={(item) => setPanel(item)} />}
        {activeTab === "stats" && <StatisticsView items={visible} onAdd={() => setPanel("new")} />}
        {activeTab === "settings" && <SettingsView theme={theme} setTheme={applyTheme} />}
      </main>

      {panel && (
        <AddEditPanel
          editing={panel}
          onClose={() => setPanel(null)}
          onDelete={requestDelete}
        />
      )}
    </div>
  );
}
