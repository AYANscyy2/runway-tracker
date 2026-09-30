"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InboxCard } from "@/db/schema";
import {
  backfillSearchIndex,
  dismissPosting,
  ingestPosting,
  listPostings,
  rescorePosting,
  restorePosting,
  retryExtraction,
  searchPostings,
  trackPosting,
  type SearchResult,
} from "@/app/inbox/actions";
import { compBand, prizeLabel, remoteLabel } from "@/lib/inbox/format";
import { DIMENSION_ORDER, MAX_TOTAL, dimensionLabel } from "@/lib/inbox/dimensions";
import { countdownLabel, formatDeadline } from "@/lib/dates";
import { useToast } from "./Toast";
import { IconChevron, IconSearch } from "./Icons";
import { ManualPostingForm } from "./ManualPostingForm";

type Filter = "open" | "dismissed" | "tracked";
type Sort = "score" | "newest" | "deadline";
type KindFilter = "all" | "job" | "hackathon";

const SORTS: { id: Sort; label: string }[] = [
  { id: "score", label: "Best match" },
  { id: "newest", label: "Newest" },
  { id: "deadline", label: "Deadline" },
];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "New" },
  { id: "dismissed", label: "Dismissed" },
  { id: "tracked", label: "Tracked" },
];

const KINDS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "All kinds" },
  { id: "job", label: "Jobs" },
  { id: "hackathon", label: "Hackathons" },
];

/** Green through amber to red, so the badge reads before the number does. */
function scoreTint(total: number): string {
  const ratio = total / MAX_TOTAL;
  if (ratio >= 0.75) return "var(--color-status-selected)";
  if (ratio >= 0.5) return "var(--color-status-in-progress)";
  if (ratio >= 0.3) return "var(--color-status-oa-assignment)";
  return "var(--color-status-rejected)";
}

function bucketOf(card: InboxCard): Filter {
  if (card.status === "dismissed") return "dismissed";
  if (card.status === "promoted") return "tracked";
  return "open";
}

function kindOf(card: InboxCard): "job" | "hackathon" {
  return card.extraction?.kind === "hackathon" ? "hackathon" : "job";
}

/** What the card is called: the role for a job, the event for a hackathon —
 * falling back to the page's own title before admitting it has no name. */
function titleOf(card: InboxCard): { title: string; by: string | null } {
  const e = card.extraction;
  if (kindOf(card) === "hackathon") {
    return { title: e?.eventName ?? card.pageTitle ?? "Untitled hackathon", by: e?.company ?? null };
  }
  return { title: e?.role ?? card.pageTitle ?? "Untitled role", by: e?.company ?? null };
}

export function InboxView({ onOpenSettings, onOpenTracker }: { onOpenSettings?: () => void; onOpenTracker?: () => void }) {
  const toast = useToast();
  const router = useRouter();
  // The Inbox fetches its own data rather than receiving it from page.tsx:
  // tab switches never hit the server, and raw JD text must never ride along
  // in the tracker's payload.
  const [cards, setCards] = useState<InboxCard[] | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [filter, setFilter] = useState<Filter>("open");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<Sort>("score");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"paste" | "manual">("paste");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  // Separate pending states: adding a posting shouldn't grey out every card,
  // and tracking one card shouldn't relabel the Add button.
  const [adding, startAdding] = useTransition();
  const [searching, startSearching] = useTransition();
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await listPostings();
    if (res.ok) {
      setCards(res.data.cards);
      setHasProfile(res.data.hasProfile);
    } else {
      toast.push({ message: res.error, tone: "danger" });
    }
  }, [toast]);

  const search = useCallback(async (q: string) => {
    const res = await searchPostings(q);
    if (!res.ok) { toast.push({ message: res.error, tone: "danger", duration: 7000 }); return; }
    setResults(res.data);
  }, [toast]);

  /** After any change: the list, and the search results if they're showing. */
  const refresh = useCallback(async () => {
    await Promise.all([load(), activeQuery ? search(activeQuery) : Promise.resolve()]);
  }, [load, search, activeQuery]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount is this view's whole contract
  useEffect(() => { void load(); }, [load]);

  // Extraction runs after the ingest action returns, so a fresh card starts
  // out 'extracting'. Poll until it settles.
  const extracting = cards?.some((c) => c.status === "extracting") ?? false;
  useEffect(() => {
    if (!extracting) return;
    const timer = setInterval(() => { void refresh(); }, 3000);
    return () => clearInterval(timer);
  }, [extracting, refresh]);

  /** Run a per-card action with only that card marked busy. */
  function withCard(id: number, fn: () => Promise<void>) {
    setBusyIds((s) => new Set(s).add(id));
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; });
      }
    });
  }

  function submit() {
    const value = input.trim();
    if (!value) return;
    const looksLikeUrl = /^https?:\/\/\S+$/i.test(value);

    startAdding(async () => {
      const res = await ingestPosting(looksLikeUrl ? { kind: "url", url: value } : { kind: "text", text: value });
      if (!res.ok) {
        toast.push({ message: res.error, tone: "danger", duration: 8000 });
        return;
      }
      setInput("");
      if (res.data.note) toast.push({ message: res.data.note });
      setFilter("open");
      await load();
    });
  }

  function retry(id: number) {
    withCard(id, async () => {
      const res = await retryExtraction(id);
      if (!res.ok) toast.push({ message: res.error, tone: "danger" });
      await refresh();
    });
  }

  function rescore(id: number) {
    withCard(id, async () => {
      const res = await rescorePosting(id);
      if (!res.ok) toast.push({ message: res.error, tone: "danger" });
      await refresh();
    });
  }

  function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) { clearSearch(); return; }
    setActiveQuery(trimmed);
    startSearching(() => search(trimmed));
  }

  function clearSearch() {
    setQuery("");
    setActiveQuery(null);
    setResults(null);
  }

  function backfill() {
    startSearching(async () => {
      const res = await backfillSearchIndex();
      if (!res.ok) { toast.push({ message: res.error, tone: "danger" }); return; }
      const { indexed, failed } = res.data;
      toast.push({
        message: indexed === 0 && failed === 0
          ? "Everything is already indexed"
          : `Indexed ${indexed} posting${indexed === 1 ? "" : "s"}${failed ? ` · ${failed} couldn't be indexed (see server log)` : ""}`,
        tone: failed && !indexed ? "danger" : "info",
      });
      if (activeQuery && indexed > 0) await search(activeQuery);
    });
  }

  function track(card: InboxCard) {
    withCard(card.id, async () => {
      const res = await trackPosting(card.id);
      if (!res.ok) {
        toast.push({ message: res.error, tone: "danger" });
        return;
      }
      await refresh();
      // The tracker's rows come from the server component, and switching tabs
      // is client-side only — so ask for a fresh render or the new entry won't
      // appear until a reload.
      router.refresh();
      toast.push({
        message: `Added ${titleOf(card).by ?? titleOf(card).title} to your tracker`,
        action: onOpenTracker ? { label: "View", onClick: onOpenTracker } : undefined,
      });
    });
  }

  function dismiss(card: InboxCard, reason: string) {
    withCard(card.id, async () => {
      const res = await dismissPosting(card.id, reason);
      if (!res.ok) {
        toast.push({ message: res.error, tone: "danger" });
        return;
      }
      await refresh();
      toast.push({
        message: "Dismissed",
        action: { label: "Undo", onClick: () => restore(card.id) },
      });
    });
  }

  function restore(id: number) {
    withCard(id, async () => {
      const res = await restorePosting(id);
      if (!res.ok) toast.push({ message: res.error, tone: "danger" });
      await refresh();
    });
  }

  const ofKind = (cards ?? []).filter((c) => kind === "all" || c.status === "failed" || c.status === "extracting" || kindOf(c) === kind);
  const counts = {
    open: ofKind.filter((c) => bucketOf(c) === "open").length,
    dismissed: ofKind.filter((c) => bucketOf(c) === "dismissed").length,
    tracked: ofKind.filter((c) => bucketOf(c) === "tracked").length,
  };
  const visible = ofKind
    .filter((c) => bucketOf(c) === filter)
    .sort((a, b) => {
      // Cards still being read or needing attention stay on top.
      const pin = (c: InboxCard) => (c.status === "extracting" || c.status === "failed" ? 0 : 1);
      if (pin(a) !== pin(b)) return pin(a) - pin(b);
      if (sort === "score") return (b.score?.total ?? -1) - (a.score?.total ?? -1);
      if (sort === "deadline") {
        // Undated postings sort last rather than pretending to be urgent.
        const ad = a.extraction?.deadline, bd = b.extraction?.deadline;
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return ad.localeCompare(bd);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const cardProps = (card: InboxCard) => ({
    card,
    onRetry: () => retry(card.id),
    onTrack: () => track(card),
    onDismiss: (reason: string) => dismiss(card, reason),
    onRestore: () => restore(card.id),
    onRescore: () => rescore(card.id),
    busy: busyIds.has(card.id),
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-10">
      {/* ─── Add box ─── */}
      <div className="rounded border-2 border-border bg-bg-card p-4 shadow-hard-2">
        <div className="mb-3 flex gap-px overflow-hidden rounded border-2 border-border bg-surface">
          {(["paste", "manual"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-2xs font-extrabold uppercase tracking-wider transition-colors ${
                mode === m ? "bg-primary text-white" : "bg-bg-card text-ink-muted hover:text-ink"
              }`}
            >
              {m === "paste" ? "Paste or link" : "Type it in"}
            </button>
          ))}
        </div>

        {mode === "manual" ? (
          <ManualPostingForm onDone={() => { setMode("paste"); void refresh(); }} onCancel={() => setMode("paste")} />
        ) : (
        <>
        <label htmlFor="jd-input" className="text-xs font-extrabold uppercase tracking-widest text-ink-muted">
          Paste a job description or hackathon page, or a link to one
        </label>
        <textarea
          id="jd-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); } }}
          rows={4}
          placeholder="Paste the full text of the posting here — or a URL on its own line."
          className="mt-2 w-full resize-y rounded border-2 border-border bg-surface px-3 py-2 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:bg-primary-soft"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-2xs text-ink-faint">
            Workday and some boards block automated fetches — paste their text instead. ⌘/Ctrl + Enter to submit.
          </p>
          <button
            onClick={submit}
            disabled={adding || !input.trim()}
            className="shrink-0 rounded border-2 border-border bg-primary px-4 py-2 text-sm font-bold text-white shadow-hard-1 btn-push disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add to inbox"}
          </button>
        </div>
        </>
        )}
      </div>

      {!hasProfile && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border-2 border-border bg-primary-soft px-4 py-3 text-sm text-ink shadow-hard-1">
          <span>
            <span className="font-extrabold">No match profile yet</span> — postings aren&apos;t scored until you tell Runway your stack, pay and locations.
          </span>
          {onOpenSettings && (
            <button onClick={onOpenSettings} className="rounded border-2 border-border bg-bg-card px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-ink shadow-hard-1 btn-push-sm">
              Set it up
            </button>
          )}
        </div>
      )}

      {/* ─── Search ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            <IconSearch className="text-sm" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); runSearch(query); }
              if (e.key === "Escape") clearSearch();
            }}
            placeholder="Search postings — words or meaning, e.g. &quot;owns a service end to end&quot;"
            className="w-full rounded border-2 border-border bg-bg-card py-2 pl-9 pr-3 text-sm font-medium text-ink shadow-hard-1 outline-none placeholder:text-ink-faint focus:bg-primary-soft"
          />
        </div>
        <button
          onClick={() => runSearch(query)}
          disabled={searching || !query.trim()}
          className="rounded border-2 border-border bg-primary px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-hard-1 btn-push-sm disabled:opacity-50"
        >
          {searching ? "Searching…" : "Search"}
        </button>
        {results !== null && (
          <button onClick={clearSearch} className="px-2 py-2 text-xs font-bold text-ink-muted hover:text-ink">
            Clear
          </button>
        )}
      </div>

      {/* ─── Header + filters ─── */}
      <div className={`flex-wrap items-center gap-3 ${results === null ? "flex" : "hidden"}`}>
        <div className="flex gap-px overflow-hidden rounded border-2 border-border bg-surface shadow-hard-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                filter === f.id ? "bg-primary text-white" : "bg-bg-card text-ink-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {f.label} {counts[f.id]}
            </button>
          ))}
        </div>

        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
          aria-label="Filter by kind"
          className="rounded border-2 border-border bg-bg-card px-3 py-2 text-xs font-bold text-ink shadow-hard-1 outline-none"
        >
          {KINDS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort postings"
          className="rounded border-2 border-border bg-bg-card px-3 py-2 text-xs font-bold text-ink shadow-hard-1 outline-none"
        >
          {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      {/* ─── Cards ─── */}
      {results !== null ? (
        <SearchResults results={results} onBackfill={backfill} busy={searching} renderCard={(card) => <PostingCard {...cardProps(card)} />} />
      ) : cards === null ? (
        <CardSkeleton />
      ) : visible.length === 0 ? (
        <Empty filter={filter} />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((card) => <PostingCard key={card.id} {...cardProps(card)} />)}
        </div>
      )}
    </div>
  );
}

function Empty({ filter }: { filter: Filter }) {
  const copy: Record<Filter, string> = {
    open: "Nothing waiting. Paste a job description or hackathon page above and it'll be read and filed here.",
    dismissed: "Nothing dismissed yet.",
    tracked: "Nothing promoted to the tracker yet.",
  };
  return (
    <div className="rounded-lg border-2 border-dashed border-border px-6 py-14 text-center text-sm text-ink-muted">
      {copy[filter]}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse rounded border-2 border-border bg-bg-card p-4 shadow-hard-1">
          <div className="h-4 w-1/3 rounded bg-surface-2" />
          <div className="mt-3 h-3 w-1/2 rounded bg-surface-2" />
          <div className="mt-2 h-3 w-1/4 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "accent" | "warn" }) {
  const cls = tone === "accent"
    ? "bg-primary text-white"
    : tone === "warn"
      ? "bg-danger-soft text-danger"
      : "bg-surface text-ink";
  return (
    <span className={`rounded border-2 border-border px-2 py-0.5 text-2xs font-bold ${cls}`}>
      {children}
    </span>
  );
}

const DISMISS_REASONS = ["Pay too low", "Wrong stack", "Wrong location", "Too senior", "Not eligible", "Duplicate", "Not interested"];

const btn = "rounded border-2 border-border px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider shadow-hard-1 btn-push-sm disabled:opacity-50";

function PostingCard({
  card, onRetry, onTrack, onDismiss, onRestore, onRescore, busy,
}: {
  card: InboxCard;
  onRetry: () => void;
  onTrack: () => void;
  onDismiss: (reason: string) => void;
  onRestore: () => void;
  onRescore: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [askingReason, setAskingReason] = useState(false);
  const e = card.extraction;
  const hackathon = kindOf(card) === "hackathon";

  const reasonPicker = (
    <div className="flex flex-wrap items-center gap-1.5 border-t-2 border-border px-4 py-3">
      <span className="mr-1 text-2xs font-extrabold uppercase tracking-wider text-ink-muted">Why?</span>
      {DISMISS_REASONS.map((r) => (
        <button
          key={r}
          onClick={() => { setAskingReason(false); onDismiss(r); }}
          disabled={busy}
          className="rounded border-2 border-border bg-surface px-2 py-1 text-2xs font-bold text-ink btn-push-sm disabled:opacity-50"
        >
          {r}
        </button>
      ))}
      <button onClick={() => setAskingReason(false)} className="px-2 py-1 text-2xs font-bold text-ink-muted hover:text-ink">
        Cancel
      </button>
    </div>
  );

  if (card.status === "extracting") {
    return (
      <div className="rounded border-2 border-border bg-bg-card p-4 shadow-hard-1">
        <div className="flex items-center gap-2 text-sm font-bold text-ink-muted">
          <span className="inline-block h-2 w-2 animate-ping rounded-full bg-primary" />
          Reading {card.pageTitle ? <span className="truncate text-ink">{card.pageTitle}</span> : "the posting"}…
        </div>
        <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-surface-2" />
      </div>
    );
  }

  if (card.status === "failed") {
    return (
      <div className="rounded border-2 border-danger bg-danger-soft shadow-hard-1">
        <div className="p-4">
          <p className="text-sm font-extrabold text-danger">Couldn&apos;t read {card.pageTitle ? `“${card.pageTitle}”` : "this one"}</p>
          <p className="mt-1 text-xs font-medium text-ink">{card.failureReason ?? "Extraction failed."}</p>
          {!askingReason && (
            <div className="mt-3 flex items-center gap-2">
              <button onClick={onRetry} disabled={busy} className={`${btn} bg-bg-card text-ink`}>
                {busy ? "Retrying…" : "Retry"}
              </button>
              <button onClick={() => setAskingReason(true)} disabled={busy} className={`${btn} bg-bg-card text-ink-muted hover:text-ink`}>
                Dismiss
              </button>
            </div>
          )}
        </div>
        {askingReason && reasonPicker}
      </div>
    );
  }

  const { title, by } = titleOf(card);
  const pay = e ? (hackathon ? prizeLabel(e) : compBand(e)) : null;
  const dismissed = card.status === "dismissed";
  const deadlineLabel = hackathon ? "Submit by" : null;

  return (
    <div className={`rounded border-2 border-border bg-bg-card shadow-hard-1 ${dismissed ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold tracking-tight text-ink sm:truncate">
            {title}
            {by && <span className="font-bold text-ink-muted"> · {by}</span>}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {hackathon && <Pill tone="accent">Hackathon</Pill>}
            {e?.location && <Pill>{e.location}</Pill>}
            <Pill>{remoteLabel(e?.remote ?? null, hackathon ? "hackathon" : "job")}</Pill>
            {e?.seniority && <Pill>{e.seniority}</Pill>}
            {pay && <Pill>{pay}</Pill>}
            {e?.deadline && (
              <Pill>
                {deadlineLabel && `${deadlineLabel} `}{formatDeadline(e.deadline)} · {countdownLabel(e.deadline)}
              </Pill>
            )}
            {hackathon && e?.teamSizeMax && <Pill>Teams up to {e.teamSizeMax}</Pill>}
            {card.duplicateOfId && !dismissed && <Pill tone="warn">Possible duplicate</Pill>}
          </div>
          {hackathon && e?.eligibility && (
            <p className="mt-2 text-xs font-bold text-ink">Eligibility: <span className="font-medium text-ink-muted">{e.eligibility}</span></p>
          )}
          {e?.stack && e.stack.length > 0 && (
            <p className="mt-2 line-clamp-2 text-xs font-medium text-ink-muted sm:truncate">{e.stack.join(" · ")}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {card.score && (
            <span
              title={`${card.score.total} out of ${MAX_TOTAL}${card.score.fitPending ? " — fit not assessed yet" : ""}`}
              className="rounded border-2 border-border px-2 py-1 text-sm font-black text-ink shadow-hard-1"
              style={{ background: scoreTint(card.score.total) }}
            >
              {card.score.total}{card.score.fitPending && <span className="align-super text-2xs">*</span>}
            </span>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Hide details" : "Show details"}
            className="shrink-0 text-ink-muted hover:text-ink"
          >
            <IconChevron open={open} className="text-base" />
          </button>
        </div>
      </div>

      {/* ─── Actions ─── */}
      {!dismissed && card.status !== "promoted" && (
        askingReason ? reasonPicker : (
          <div className="flex flex-wrap items-center gap-2 border-t-2 border-border px-4 py-3">
            <button onClick={onTrack} disabled={busy} className={`${btn} bg-primary text-white`}>
              Track
            </button>
            <button onClick={() => setAskingReason(true)} disabled={busy} className={`${btn} bg-bg-card text-ink-muted hover:text-ink`}>
              Dismiss
            </button>
            {card.duplicateOfId && (
              <button onClick={() => onDismiss("Duplicate")} disabled={busy} className={`${btn} bg-bg-card text-ink-muted hover:text-ink`}>
                Dismiss as duplicate
              </button>
            )}
            {card.score?.fitPending && (
              <button
                onClick={onRescore}
                disabled={busy}
                title="Asks the model how well this suits you — uses one request"
                className={`${btn} ml-auto bg-bg-card text-ink`}
              >
                {busy ? "Assessing…" : "Assess fit"}
              </button>
            )}
          </div>
        )
      )}

      {dismissed && (
        <div className="flex items-center gap-2 border-t-2 border-border px-4 py-3">
          <button onClick={onRestore} disabled={busy} className={`${btn} bg-bg-card text-ink`}>
            Restore
          </button>
        </div>
      )}

      {card.status === "promoted" && (
        <div className="border-t-2 border-border px-4 py-3 text-xs font-bold text-ink-muted">
          In your tracker ✓
        </div>
      )}

      {open && card.score && (
        <div className="border-t-2 border-border px-4 py-3">
          <p className="mb-2 text-2xs font-extrabold uppercase tracking-wider text-ink-muted">
            Why {card.score.total}/{MAX_TOTAL}
          </p>
          <ul className="flex flex-col gap-1.5">
            {DIMENSION_ORDER.map((key) => {
              const d = card.score!.breakdown[key];
              return (
                <li key={key} className="flex items-baseline gap-2 text-xs">
                  <span className="w-24 shrink-0 font-extrabold text-ink">{dimensionLabel(key, e?.kind)}</span>
                  <span className="w-12 shrink-0 font-bold tabular-nums text-ink-muted">{d.score}/{d.max}</span>
                  <span className="text-ink-muted">{d.reason}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {open && (
        <div className="border-t-2 border-border px-4 py-3 text-xs text-ink-muted">
          {dismissed && card.dismissedReason && (
            <p className="mb-2 font-bold text-ink">Dismissed — {card.dismissedReason}</p>
          )}
          {hackathon && (e?.startsOn || e?.endsOn) && (
            <p className="mb-2">
              Runs {e?.startsOn ? formatDeadline(e.startsOn) : "?"} – {e?.endsOn ? formatDeadline(e.endsOn) : "?"}
            </p>
          )}
          {hackathon && e?.themes && e.themes.length > 0 && (
            <p className="mb-2">Themes: {e.themes.join(" · ")}</p>
          )}
          {card.sourceUrl && (
            <p className="mb-2 truncate">
              Source:{" "}
              <a href={card.sourceUrl} target="_blank" rel="noreferrer" className="font-bold text-primary underline">
                {card.sourceUrl}
              </a>
            </p>
          )}
          {e && (
            <p>
              {e.model === "manual" ? "Typed in by hand" : <>Read by {e.model} (prompt {e.promptVersion}) in {e.attemptCount} attempt{e.attemptCount > 1 ? "s" : ""}</>}
              {e.retriedRule && <> · flagged <span className="font-bold text-ink">{e.retriedRule}</span></>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_NOTE: Partial<Record<InboxCard["status"], string>> = {
  dismissed: "Dismissed",
  promoted: "Tracked",
  failed: "Couldn't be read",
};

function SearchResults({
  results, onBackfill, busy, renderCard,
}: {
  results: SearchResult[];
  onBackfill: () => void;
  busy: boolean;
  renderCard: (card: InboxCard) => React.ReactNode;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm font-bold text-ink">Nothing matched.</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-ink-muted">
          Postings added before search existed, or whose indexing failed, aren&apos;t searchable yet.
        </p>
        <button onClick={onBackfill} disabled={busy} className={`${btn} mt-3 bg-bg-card text-ink`}>
          {busy ? "Indexing…" : "Index older postings"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-2xs font-extrabold uppercase tracking-wider text-ink-muted">
        {results.length} result{results.length > 1 ? "s" : ""}
      </p>
      {results.map(({ card, hit }) => (
        <div key={card.id} className="flex flex-col gap-1.5">
          {/* Why this surfaced — a semantic-only hit with no shared words is
              otherwise baffling. */}
          <div className="flex flex-wrap items-center gap-1.5 px-1 text-2xs text-ink-muted">
            {hit.matchedBy.includes("keyword") && <Pill>words</Pill>}
            {hit.matchedBy.includes("semantic") && <Pill>meaning</Pill>}
            {STATUS_NOTE[card.status] && <Pill tone="warn">{STATUS_NOTE[card.status]}</Pill>}
            {hit.snippet && (
              <span className="line-clamp-1 min-w-0 flex-1">
                {hit.section && <span className="font-extrabold uppercase tracking-wider text-ink">{hit.section} · </span>}
                {hit.snippet}
              </span>
            )}
          </div>
          {renderCard(card)}
        </div>
      ))}
    </div>
  );
}
