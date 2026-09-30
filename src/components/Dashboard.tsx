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
} from "@/lib/constants";
import { daysUntil, todayIso } from "@/lib/dates";
import { parseQuick, parseStatus, parseType, type QuickFilter } from "@/lib/view-params";
import { deleteOpportunity, restoreOpportunity, type OpportunityInput } from "@/app/actions";
import { OpportunityTable } from "./OpportunityTable";
import { AddEditPanel, type NewDefaults } from "./AddEditPanel";
import { CalendarView } from "./CalendarView";
import { NotificationsView } from "./NotificationsView";
import { StatisticsView } from "./StatisticsView";
import { SettingsView } from "./SettingsView";
import { InboxView } from "./InboxView";
import { UserMenu } from "./UserMenu";
import { useToast } from "./Toast";
import { IconBell, IconCalendar, IconChart, IconGear, IconGrid, IconInbox } from "./Icons";

type Tab = "tracker" | "inbox" | "calendar" | "agenda" | "stats" | "settings";

const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "tracker",  label: "Tracker",    icon: <IconGrid /> },
  { id: "inbox",    label: "Inbox",      icon: <IconInbox /> },
  { id: "calendar", label: "Calendar",   icon: <IconCalendar /> },
  { id: "agenda",   label: "Agenda",     icon: <IconBell /> },
  { id: "stats",    label: "Statistics", icon: <IconChart /> },
  { id: "settings", label: "Settings",   icon: <IconGear /> },
];

const TABS: Tab[] = NAV.map((n) => n.id);
const UNDO_MS = 6000;

type ViewState = { tab: string; type: string; status: string; q: string; quick: string };
const VIEW_KEYS = ["tab", "type", "status", "q", "quick"] as const;

type StripId = "overdue" | "stale" | "review";
const STRIP_KEY = "runway-strip-dismissed";

/** Which strip lines were dismissed today. Stored with the date so they come
 * back tomorrow; each line is dismissed on its own so hiding the review
 * reminder doesn't also hide the overdue warning. */
function readDismissed(): StripId[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STRIP_KEY) ?? "null");
    return raw && raw.date === todayIso() && Array.isArray(raw.ids) ? raw.ids : [];
  } catch {
    return [];
  }
}

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
  const typeFilter = parseType(view.type);
  const statusFilter = parseStatus(view.status, typeFilter);
  const quick = parseQuick(view.quick);
  const statusOptions = typeFilter === "all" ? STATUS_ORDER : STATUS_FOR_TYPE[typeFilter];
  const searchQuery = view.q;
  const searchRef = useRef<HTMLInputElement>(null);
  // "/" from another tab switches to the tracker; the search box only exists
  // once that render commits, so focusing waits for it.
  const [focusSearch, setFocusSearch] = useState(0);
  useEffect(() => {
    if (focusSearch && activeTab === "tracker") searchRef.current?.focus();
  }, [focusSearch, activeTab]);

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [panel, setPanel] = useState<OpportunityWithUrls | "new" | null>(null);
  const [newDefaults, setNewDefaults] = useState<NewDefaults | undefined>(undefined);
  const openNew = useCallback((defaults?: NewDefaults) => {
    setNewDefaults(defaults);
    setPanel("new");
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dismissedStrip, setDismissedStrip] = useState<StripId[]>([]);
  const [isReviewDay, setIsReviewDay] = useState(false);
  // Sampled rather than read during render: staleness only turns over daily,
  // so a clock reading per render buys nothing and makes the render impure.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Set<number>>(new Set());

  // Everything the server can't know: the theme the pre-paint script chose,
  // which strip lines were dismissed today, and today's weekday. Re-read when
  // the tab comes back into view, so a tab left open overnight moves on to
  // the new day instead of keeping yesterday's dismissals and staleness.
  /* eslint-disable react-hooks/set-state-in-effect -- reading browser-only state after hydration is the point of this effect */
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark" || t === "light") setTheme(t);
    const sample = () => {
      setDismissedStrip(readDismissed());
      setIsReviewDay([2, 4].includes(new Date().getDay()));
      setNowMs(Date.now());
    };
    sample();
    const onVisible = () => { if (document.visibilityState === "visible") sample(); };
    document.addEventListener("visibilitychange", onVisible);
    const hourly = setInterval(sample, 60 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(hourly);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const applyTheme = useCallback((t: "light" | "dark") => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    try { window.localStorage.setItem("runway-theme", t); } catch {}
  }, []);

  function dismissStripLine(id: StripId) {
    const next = [...new Set([...readDismissed(), id])];
    setDismissedStrip(next);
    try { window.localStorage.setItem(STRIP_KEY, JSON.stringify({ date: todayIso(), ids: next })); } catch {}
  }

  // ── Derived sets ─────────────────────────────────────────────────
  const visible = useMemo(
    () => initialData.filter((i) => !pendingDelete.has(i.id)),
    [initialData, pendingDelete],
  );

  const staleItems = useMemo(() => {
    if (nowMs === null) return [];
    // Measured from the user's own tracking row, so marking something
    // "applied" restarts the clock and other users' edits don't reset it.
    return visible.filter(
      (i) => i.status === "applied" && i.trackedAt !== null &&
        (nowMs - new Date(i.trackedAt).getTime()) / 86_400_000 >= STALE_AFTER_DAYS,
    );
  }, [visible, nowMs]);

  const overdueItems = useMemo(
    // nowMs is a dependency so a new day recomputes this; daysUntil reads the clock itself.
    () => nowMs === null ? [] : visible.filter((i) => deadlineMatters(i.type, i.status) && (daysUntil(i.deadline) ?? 1) < 0),
    [visible, nowMs],
  );

  const agendaCount = useMemo(
    () => nowMs === null ? 0 :
      visible.filter((i) => {
        if (TERMINAL_STATUSES.includes(i.status)) return false;
        const d = deadlineMatters(i.type, i.status) ? daysUntil(i.deadline) : null;
        const f = daysUntil(i.followUpDate);
        return (d !== null && d <= 0) || (f !== null && f <= 0);
      }).length,
    [visible, nowMs],
  );

  const isFiltered = Boolean(searchQuery.trim() || typeFilter !== "all" || statusFilter !== "all" || quick);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visible
      .filter((i) => typeFilter === "all" || i.type === typeFilter)
      .filter((i) => statusFilter === "all" || i.status === statusFilter)
      .filter((i) => {
        if (!q) return true;
        // Includes what Track copies from the Inbox, so "golang" or
        // "backend" finds a promoted entry.
        return [i.name, i.role, i.location, i.source, i.referralContact, i.nextAction, i.notes, ...(i.stack ?? [])]
          .some((v) => v?.toLowerCase().includes(q));
      })
      .filter((i) => {
        if (quick === "stale") return staleItems.includes(i);
        if (quick === "overdue") return overdueItems.includes(i);
        return true;
      });
  }, [visible, typeFilter, statusFilter, searchQuery, quick, staleItems, overdueItems]);

  // ── Delete with undo ─────────────────────────────────────────────
  // Saved immediately (a soft delete) and hidden optimistically; Undo restores
  // it. Deleting only once the toast expired lost the delete on a reload.
  const unhide = useCallback((id: number) => {
    setPendingDelete((s) => { const n = new Set(s); n.delete(id); return n; });
  }, []);

  const requestDelete = useCallback((item: OpportunityWithUrls) => {
    setPendingDelete((s) => new Set(s).add(item.id));
    setPanel(null);
    void (async () => {
      const res = await deleteOpportunity(item.id);
      if (!res.ok) {
        unhide(item.id);
        toast.push({ message: `Couldn't delete: ${res.error}`, tone: "danger" });
        return;
      }
      toast.push({
        message: `Removed ${item.name}`,
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: async () => {
            const undo = await restoreOpportunity(item.id);
            if (undo.ok) unhide(item.id);
            else toast.push({ message: `Couldn't restore: ${undo.error}`, tone: "danger" });
          },
        },
      });
    })();
  }, [toast, unhide]);

  // Once the server's list no longer has a deleted row, stop tracking it —
  // and if Undo brought it back, it must not stay hidden.
  const liveIds = useMemo(() => new Set(initialData.map((i) => i.id)), [initialData]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pruning local state against fresh server data
    setPendingDelete((s) => {
      const n = new Set([...s].filter((id) => liveIds.has(id)));
      return n.size === s.size ? s : n;
    });
  }, [liveIds]);

  /** A new entry the current filters would hide gets a way to see it. */
  const onSaved = useCallback((payload: OpportunityInput, isEdit: boolean) => {
    const q = searchQuery.trim().toLowerCase();
    const hidden = !isEdit && (
      (typeFilter !== "all" && payload.type !== typeFilter) ||
      (statusFilter !== "all" && payload.status !== statusFilter) ||
      quick !== "" ||
      (q !== "" && ![payload.name, payload.source, payload.referralContact, payload.nextAction, payload.notes].some((v) => v?.toLowerCase().includes(q)))
    );
    toast.push(hidden
      ? {
          message: `Added ${payload.name} — hidden by your filters`,
          action: { label: "Show all", onClick: () => setParams({ q: "", type: "", status: "", quick: "" }) },
          duration: 6000,
        }
      : { message: isEdit ? `Saved ${payload.name}` : `Added ${payload.name}` });
  }, [toast, searchQuery, typeFilter, statusFilter, quick, setParams]);

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (panel) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n") { e.preventDefault(); openNew(); }
      if (e.key === "/") { e.preventDefault(); setParams({ tab: "" }); setFocusSearch((n) => n + 1); }
      // 1–6 jump straight to a tab, in sidebar order.
      const idx = Number(e.key) - 1;
      if (Number.isInteger(idx) && idx >= 0 && idx < TABS.length) {
        e.preventDefault();
        setParams({ tab: TABS[idx] === "tracker" ? "" : TABS[idx] });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, setParams, openNew]);

  const goTab = (t: Tab) => setParams({ tab: t === "tracker" ? "" : t });

  // The quick filters replace any other filter: "Clean up" with a status
  // filter still set would land on an empty table.
  const showOnly = (q: QuickFilter) => setParams({ tab: "", quick: q, q: "", type: "", status: "" });

  const stripLines: { id: StripId; text: string; cta?: { label: string; onClick: () => void } }[] = [];
  if (overdueItems.length > 0)
    stripLines.push({
      id: "overdue",
      text: `${overdueItems.length} deadline${overdueItems.length > 1 ? "s have" : " has"} passed — update their status or drop them.`,
      cta: { label: "Clean up", onClick: () => showOnly("overdue") },
    });
  if (staleItems.length > 0)
    stripLines.push({
      id: "stale",
      text: `${staleItems.length} application${staleItems.length > 1 ? "s haven't" : " hasn't"} moved in ${STALE_AFTER_DAYS} days.`,
      cta: { label: "Review", onClick: () => showOnly("stale") },
    });
  if (isReviewDay)
    stripLines.push({
      id: "review",
      text: `It's ${new Date().toLocaleDateString("en", { weekday: "long" })} — a review day. Go through what's due and what's gone quiet.`,
      cta: { label: "Open agenda", onClick: () => goTab("agenda") },
    });
  const shownStrip = stripLines.filter((l) => !dismissedStrip.includes(l.id));

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* ─── Sidebar ─── */}
      <aside
        className={`relative hidden shrink-0 flex-col border-r-2 border-border bg-surface transition-all duration-200 ease-in-out md:flex ${
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
            onClick={() => openNew()}
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
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:p-6 md:pb-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-extrabold tracking-tight text-ink">
            <span className="text-primary md:hidden">Runway</span>
            <span className="hidden md:inline">{NAV.find((n) => n.id === activeTab)?.label}</span>
          </h2>
          <UserMenu
            theme={theme}
            onToggleTheme={() => applyTheme(theme === "dark" ? "light" : "dark")}
            onOpenSettings={() => goTab("settings")}
          />
        </div>

        {/* One attention strip instead of stacked banners */}
        {activeTab === "tracker" && shownStrip.length > 0 && (
          <div className="mb-4 rounded border-2 border-border bg-tertiary-soft px-4 py-2.5 shadow-hard-1-muted">
            <ul className="flex flex-col gap-1.5 text-sm font-bold text-ink">
              {shownStrip.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{l.text}</span>
                    {l.cta && (
                      <button onClick={l.cta.onClick} className="text-xs font-extrabold uppercase tracking-wider text-primary underline hover:no-underline">
                        {l.cta.label} →
                      </button>
                    )}
                  </span>
                  <button onClick={() => dismissStripLine(l.id)} aria-label="Dismiss for today" title="Dismiss for today" className="font-bold text-ink-muted hover:text-ink">×</button>
                </li>
              ))}
            </ul>
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
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  if (searchQuery) setParams({ q: "" });
                  else e.currentTarget.blur();
                }}
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

              {isFiltered && visible.length > 0 && (
                <span className="text-xs font-bold text-ink-muted">
                  {filtered.length} of {visible.length}
                  <button
                    onClick={() => setParams({ q: "", type: "", status: "", quick: "" })}
                    className="ml-2 font-extrabold text-primary underline hover:no-underline"
                  >
                    Clear
                  </button>
                </span>
              )}
            </div>

            <OpportunityTable
              items={filtered}
              totalCount={visible.length}
              onEdit={(item) => setPanel(item)}
              onAdd={() => openNew()}
              onClearFilters={() => setParams({ q: "", type: "", status: "", quick: "" })}
            />
          </>
        )}

        {activeTab === "inbox" && <InboxView onOpenSettings={() => goTab("settings")} onOpenTracker={() => goTab("tracker")} />}
        {activeTab === "calendar" && <CalendarView items={visible} onItemClick={(item) => setPanel(item)} onAdd={() => openNew()} onDayClick={(iso) => openNew({ deadline: iso })} />}
        {activeTab === "agenda" && <NotificationsView items={visible} onItemClick={(item) => setPanel(item)} />}
        {activeTab === "stats" && <StatisticsView items={visible} onAdd={() => openNew()} />}
        {activeTab === "settings" && <SettingsView theme={theme} setTheme={applyTheme} />}
      </main>

      {/* ─── Mobile: bottom nav replaces the sidebar ─── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t-2 border-border bg-surface md:hidden">
        {NAV.map(({ id, icon, label }) => {
          const active = activeTab === id;
          const badge = id === "agenda" ? agendaCount : 0;
          return (
            <button
              key={id}
              onClick={() => goTab(id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[9px] font-extrabold uppercase tracking-wide transition-colors ${
                active ? "text-primary" : "text-ink-muted"
              }`}
            >
              <span className="text-base">{icon}</span>
              <span className="truncate px-0.5">{label}</span>
              {badge > 0 && (
                <span className="absolute right-1/2 top-1 ml-3 flex h-4 min-w-4 translate-x-4 items-center justify-center rounded-full border-2 border-border bg-danger px-1 text-[8px] font-extrabold text-white">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* The sidebar's "+ Log opportunity" has nowhere to live on a phone. */}
      <button
        onClick={() => openNew()}
        aria-label="Log opportunity"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-border bg-primary text-2xl font-extrabold text-white shadow-hard-2 btn-push md:hidden"
      >
        +
      </button>

      {panel && (
        <AddEditPanel
          editing={panel}
          defaults={panel === "new" ? newDefaults : undefined}
          onClose={() => setPanel(null)}
          onDelete={requestDelete}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
