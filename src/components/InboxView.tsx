"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InboxCard, MatchDimension } from "@/db/schema";
import {
  dismissPosting,
  ingestPosting,
  listPostings,
  restorePosting,
  retryExtraction,
  trackPosting,
} from "@/app/inbox/actions";
import { compBand, remoteLabel } from "@/lib/inbox/format";
import { MAX_TOTAL } from "@/lib/inbox/rubric";
import { countdownLabel, formatDeadline } from "@/lib/dates";
import { useToast } from "./Toast";
import { IconChevron } from "./Icons";
import { ManualPostingForm } from "./ManualPostingForm";

type Filter = "open" | "dismissed" | "tracked";
type Sort = "score" | "newest" | "deadline";

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

const DIMENSION_LABEL = {
  stack: "Stack", comp: "Pay", location: "Location", startDate: "Timing", fit: "Fit",
} as const;

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

export function InboxView() {
  const toast = useToast();
  const router = useRouter();
  // The Inbox fetches its own data rather than receiving it from page.tsx:
  // tab switches never hit the server, and raw JD text must never ride along
  // in the tracker's payload.
  const [cards, setCards] = useState<InboxCard[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [sort, setSort] = useState<Sort>("score");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"paste" | "manual">("paste");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await listPostings();
    if (res.ok) setCards(res.data);
    else toast.push({ message: res.error, tone: "danger" });
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  function submit() {
    const value = input.trim();
    if (!value) return;
    const looksLikeUrl = /^https?:\/\/\S+$/i.test(value);

    startTransition(async () => {
      const res = await ingestPosting(looksLikeUrl ? { kind: "url", url: value } : { kind: "text", text: value });
      if (!res.ok) {
        toast.push({ message: res.error, tone: "danger", duration: 8000 });
        return;
      }
      setInput("");
      await load();
    });
  }

  function retry(id: number) {
    startTransition(async () => {
      const res = await retryExtraction(id);
      if (!res.ok) toast.push({ message: res.error, tone: "danger" });
      await load();
    });
  }

  function track(card: InboxCard) {
    startTransition(async () => {
      const res = await trackPosting(card.id);
      if (!res.ok) {
        toast.push({ message: res.error, tone: "danger" });
        return;
      }
      await load();
      // The tracker's rows come from the server component, and switching tabs
      // is client-side only — so ask for a fresh render or the new entry won't
      // appear until a reload.
      router.refresh();
      toast.push({
        message: `Added ${card.extraction?.company ?? "it"} to your tracker`,
        action: { label: "View", onClick: () => { window.location.href = "/"; } },
      });
    });
  }

  function dismiss(card: InboxCard, reason: string) {
    startTransition(async () => {
      const res = await dismissPosting(card.id, reason);
      if (!res.ok) {
        toast.push({ message: res.error, tone: "danger" });
        return;
      }
      await load();
      toast.push({
        message: "Dismissed",
        action: {
          label: "Undo",
          onClick: () => startTransition(async () => { await restorePosting(card.id); await load(); }),
        },
      });
    });
  }

  const counts = {
    open: cards?.filter((c) => bucketOf(c) === "open").length ?? 0,
    dismissed: cards?.filter((c) => bucketOf(c) === "dismissed").length ?? 0,
    tracked: cards?.filter((c) => bucketOf(c) === "tracked").length ?? 0,
  };
  const visible = (cards ?? [])
    .filter((c) => bucketOf(c) === filter)
    .sort((a, b) => {
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
          <ManualPostingForm onDone={() => { setMode("paste"); void load(); }} onCancel={() => setMode("paste")} />
        ) : (
        <>
        <label htmlFor="jd-input" className="text-xs font-extrabold uppercase tracking-widest text-ink-muted">
          Paste a job description, or a link to one
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
            LinkedIn and Workday block automated fetches — paste their text instead. ⌘/Ctrl + Enter to submit.
          </p>
          <button
            onClick={submit}
            disabled={isPending || !input.trim()}
            className="shrink-0 rounded border-2 border-border bg-primary px-4 py-2 text-sm font-bold text-white shadow-hard-1 btn-push disabled:opacity-50"
          >
            {isPending ? "Reading…" : "Add to inbox"}
          </button>
        </div>
        </>
        )}
      </div>

      {/* ─── Header + filters ─── */}
      <div className="flex flex-wrap items-center gap-3">
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
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort postings"
          className="rounded border-2 border-border bg-bg-card px-3 py-2 text-xs font-bold text-ink shadow-hard-1 outline-none"
        >
          {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      {/* ─── Cards ─── */}
      {cards === null ? (
        <CardSkeleton />
      ) : visible.length === 0 ? (
        <Empty filter={filter} />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((card) => (
            <PostingCard
              key={card.id}
              card={card}
              onRetry={() => retry(card.id)}
              onTrack={() => track(card)}
              onDismiss={(reason) => dismiss(card, reason)}
              onRestore={() => startTransition(async () => { await restorePosting(card.id); await load(); })}
              busy={isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ filter }: { filter: Filter }) {
  const copy: Record<Filter, string> = {
    open: "Nothing waiting. Paste a job description above and it'll be read and filed here.",
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

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border-2 border-border bg-surface px-2 py-0.5 text-2xs font-bold text-ink">
      {children}
    </span>
  );
}

const DISMISS_REASONS = ["Pay too low", "Wrong stack", "Wrong location", "Too senior", "Not interested"];

function PostingCard({
  card, onRetry, onTrack, onDismiss, onRestore, busy,
}: {
  card: InboxCard;
  onRetry: () => void;
  onTrack: () => void;
  onDismiss: (reason: string) => void;
  onRestore: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [askingReason, setAskingReason] = useState(false);
  const e = card.extraction;

  if (card.status === "extracting") {
    return (
      <div className="rounded border-2 border-border bg-bg-card p-4 shadow-hard-1">
        <div className="flex items-center gap-2 text-sm font-bold text-ink-muted">
          <span className="inline-block h-2 w-2 animate-ping rounded-full bg-primary" />
          Reading the posting…
        </div>
        <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-surface-2" />
      </div>
    );
  }

  if (card.status === "failed") {
    return (
      <div className="rounded border-2 border-danger bg-danger-soft p-4 shadow-hard-1">
        <p className="text-sm font-extrabold text-danger">Couldn&apos;t read this one</p>
        <p className="mt-1 text-xs font-medium text-ink">{card.failureReason ?? "Extraction failed."}</p>
        <button
          onClick={onRetry}
          disabled={busy}
          className="mt-3 rounded border-2 border-border bg-bg-card px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-ink shadow-hard-1 btn-push-sm disabled:opacity-50"
        >
          Retry
        </button>
      </div>
    );
  }

  const band = e ? compBand(e) : null;
  const dismissed = card.status === "dismissed";

  return (
    <div className={`rounded border-2 border-border bg-bg-card shadow-hard-1 ${dismissed ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-extrabold tracking-tight text-ink">
            {e?.role ?? "Untitled role"}
            {e?.company && <span className="font-bold text-ink-muted"> · {e.company}</span>}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {e?.location && <Pill>{e.location}</Pill>}
            <Pill>{remoteLabel(e?.remote ?? null)}</Pill>
            {e?.seniority && <Pill>{e.seniority}</Pill>}
            {band && <Pill>{band}</Pill>}
            {e?.deadline && (
              <Pill>
                {formatDeadline(e.deadline)} · {countdownLabel(e.deadline)}
              </Pill>
            )}
          </div>
          {e?.stack && e.stack.length > 0 && (
            <p className="mt-2 truncate text-xs font-medium text-ink-muted">{e.stack.join(" · ")}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {card.score && (
            <span
              title={`${card.score.total} out of ${MAX_TOTAL}`}
              className="rounded border-2 border-border px-2 py-1 text-sm font-black text-ink shadow-hard-1"
              style={{ background: scoreTint(card.score.total) }}
            >
              {card.score.total}
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
        askingReason ? (
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
        ) : (
          <div className="flex items-center gap-2 border-t-2 border-border px-4 py-3">
            <button
              onClick={onTrack}
              disabled={busy}
              className="rounded border-2 border-border bg-primary px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-hard-1 btn-push-sm disabled:opacity-50"
            >
              Track
            </button>
            <button
              onClick={() => setAskingReason(true)}
              disabled={busy}
              className="rounded border-2 border-border bg-bg-card px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-muted shadow-hard-1 btn-push-sm hover:text-ink disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        )
      )}

      {dismissed && (
        <div className="flex items-center gap-2 border-t-2 border-border px-4 py-3">
          <button
            onClick={onRestore}
            disabled={busy}
            className="rounded border-2 border-border bg-bg-card px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-ink shadow-hard-1 btn-push-sm disabled:opacity-50"
          >
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
            {(Object.entries(card.score.breakdown) as [keyof typeof DIMENSION_LABEL, MatchDimension][]).map(([key, d]) => (
              <li key={key} className="flex items-baseline gap-2 text-xs">
                <span className="w-24 shrink-0 font-extrabold text-ink">{DIMENSION_LABEL[key]}</span>
                <span className="w-12 shrink-0 font-bold tabular-nums text-ink-muted">{d.score}/{d.max}</span>
                <span className="text-ink-muted">{d.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && (
        <div className="border-t-2 border-border px-4 py-3 text-xs text-ink-muted">
          {dismissed && card.dismissedReason && (
            <p className="mb-2 font-bold text-ink">Dismissed — {card.dismissedReason}</p>
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
              Read by {e.model} (prompt {e.promptVersion}) in {e.attemptCount} attempt{e.attemptCount > 1 ? "s" : ""}
              {e.retriedRule && <> · flagged <span className="font-bold text-ink">{e.retriedRule}</span></>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
