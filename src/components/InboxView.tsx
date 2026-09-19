"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { InboxCard } from "@/db/schema";
import { ingestPosting, listPostings, retryExtraction } from "@/app/inbox/actions";
import { compBand, remoteLabel } from "@/lib/inbox/format";
import { countdownLabel, formatDeadline } from "@/lib/dates";
import { useToast } from "./Toast";
import { IconChevron } from "./Icons";

type Filter = "open" | "dismissed" | "tracked";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "New" },
  { id: "dismissed", label: "Dismissed" },
  { id: "tracked", label: "Tracked" },
];

function bucketOf(card: InboxCard): Filter {
  if (card.status === "dismissed") return "dismissed";
  if (card.status === "promoted") return "tracked";
  return "open";
}

export function InboxView() {
  const toast = useToast();
  // The Inbox fetches its own data rather than receiving it from page.tsx:
  // tab switches never hit the server, and raw JD text must never ride along
  // in the tracker's payload.
  const [cards, setCards] = useState<InboxCard[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [input, setInput] = useState("");
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

  const counts = {
    open: cards?.filter((c) => bucketOf(c) === "open").length ?? 0,
    dismissed: cards?.filter((c) => bucketOf(c) === "dismissed").length ?? 0,
    tracked: cards?.filter((c) => bucketOf(c) === "tracked").length ?? 0,
  };
  const visible = (cards ?? []).filter((c) => bucketOf(c) === filter);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-10">
      {/* ─── Paste box ─── */}
      <div className="rounded border-2 border-border bg-bg-card p-4 shadow-hard-2">
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
      </div>

      {/* ─── Cards ─── */}
      {cards === null ? (
        <CardSkeleton />
      ) : visible.length === 0 ? (
        <Empty filter={filter} />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((card) => (
            <PostingCard key={card.id} card={card} onRetry={() => retry(card.id)} busy={isPending} />
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

function PostingCard({ card, onRetry, busy }: { card: InboxCard; onRetry: () => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
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

        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Hide details" : "Show details"}
          className="shrink-0 text-ink-muted hover:text-ink"
        >
          <IconChevron open={open} className="text-base" />
        </button>
      </div>

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
